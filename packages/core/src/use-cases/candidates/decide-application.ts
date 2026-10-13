import { OUTCOMES, type Application, type Outcome } from '@tt/domain';
import { z } from 'zod';
import type { CandidateDeps } from '../../candidate-ports.js';
import { ConflictError } from '../../errors.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineCandidateUseCase } from './define.js';
import { loadCardView, requireApplication } from './shared.js';
import type { ApplicationCardView } from './views.js';

/**
 * Closes an open application: outcome, closing time, and the promise kept (answered now, no deadline left). Also writes
 * the `application.decided` event. Shared by the single and the bulk decision.
 */
export async function closeApplication(deps: CandidateDeps, application: Application, outcome: Outcome): Promise<Application> {
  if (application.outcome !== null) throw new ConflictError('The application is already decided.');
  const now = deps.now();
  const saved = await deps.applications.save({
    ...application,
    outcome,
    closedAt: now,
    updatedAt: now,
    responseDueAt: null,
    respondedAt: application.respondedAt ?? now,
  });
  await recordEvent(deps, saved.organizationId, 'application.decided', { applicationId: saved.id, jobId: saved.jobId, outcome });
  return saved;
}

/** Closes the application with an outcome. A decided application is read-only. The person decides, never the agent alone. */
export const decideApplication = defineCandidateUseCase({
  name: 'decideApplication',
  input: z.object({ applicationId: z.string().min(1), outcome: z.enum(OUTCOMES) }),
  permission: 'candidate:decide',
  audit: {
    action: 'application.decided',
    target: (input) => ({ type: 'application', id: input.applicationId }),
    metadata: (input) => ({ outcome: input.outcome }),
  },
  handler: async ({ deps, actor, input }): Promise<ApplicationCardView> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    return loadCardView(deps, await closeApplication(deps, application, input.outcome));
  },
});
