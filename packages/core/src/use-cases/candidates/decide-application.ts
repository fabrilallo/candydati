import { OUTCOMES, hireDatesSchema, type ActorType, type Application, type HireDatesInput, type Outcome } from '@candydati/domain';
import { z } from 'zod';
import type { CandidateDeps } from '../../candidate-ports.js';
import { ConflictError, ValidationError } from '../../errors.js';
import { trackDecision } from '../reports/tracking.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineCandidateUseCase } from './define.js';
import { resolveHireDates, touchesHireDates } from './hire-dates.js';
import { loadCardView, requireApplication } from './shared.js';
import type { ApplicationCardView } from './views.js';

/**
 * Closes an open application: outcome, closing time, and the promise kept (answered now, no deadline left). A hire may
 * carry the offer-accepted and start dates. Also writes the `application.decided` event. Shared by the single and the bulk
 * decision.
 */
export async function closeApplication(
  deps: CandidateDeps,
  application: Application,
  outcome: Outcome,
  actorType: ActorType,
  hireDates: HireDatesInput = {},
): Promise<Application> {
  if (application.outcome !== null) throw new ConflictError('The application is already decided.');
  if (outcome !== 'hired' && touchesHireDates(hireDates)) throw new ValidationError([{ path: 'outcome', message: 'hire_dates_require_hired' }]);
  const dates = touchesHireDates(hireDates) ? resolveHireDates(application, hireDates) : {};
  const now = deps.now();
  // `outcome IS NULL` in the same statement: of two concurrent decisions exactly one writes, the other is a ConflictError.
  const saved = await deps.applications.transition(application.organizationId, application.id, {}, {
    outcome,
    closedAt: now,
    updatedAt: now,
    responseDueAt: null,
    respondedAt: application.respondedAt ?? now,
    ...dates,
  });
  await trackDecision(deps, saved, outcome, actorType);
  await deps.moveProposals?.dropOpenForApplication(saved.organizationId, saved.id, now);
  await recordEvent(deps, saved.organizationId, 'application.decided', { applicationId: saved.id, jobId: saved.jobId, outcome });
  return saved;
}

/** Closes the application with an outcome. A decided application is read-only. The person decides, never the agent alone. */
export const decideApplication = defineCandidateUseCase({
  name: 'decideApplication',
  input: hireDatesSchema.extend({ applicationId: z.string().min(1), outcome: z.enum(OUTCOMES) }),
  permission: 'candidate:decide',
  audit: {
    action: 'application.decided',
    target: (input) => ({ type: 'application', id: input.applicationId }),
    metadata: (input) => ({
      outcome: input.outcome,
      ...(input.offerAcceptedOn === undefined || input.offerAcceptedOn === null ? {} : { offerAcceptedOn: input.offerAcceptedOn }),
      ...(input.startOn === undefined || input.startOn === null ? {} : { startOn: input.startOn }),
    }),
  },
  handler: async ({ deps, actor, input }): Promise<ApplicationCardView> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    return loadCardView(deps, await closeApplication(deps, application, input.outcome, actor.type, input));
  },
});
