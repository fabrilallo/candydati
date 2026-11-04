import { hireDatesSchema } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { resolveHireDates, touchesHireDates } from './hire-dates.js';
import { loadCardView, requireApplication } from './shared.js';
import type { ApplicationCardView } from './views.js';

/**
 * Sets, changes or clears (null) the offer-accepted and start dates of a hired application. Absent keeps the stored value.
 * Same permission as recording the outcome. The audit event carries the dates that were written.
 */
export const updateHireDates = defineCandidateUseCase({
  name: 'updateHireDates',
  input: hireDatesSchema.extend({ applicationId: z.string().min(1) }).refine(touchesHireDates, { message: 'no_change' }),
  permission: 'candidate:decide',
  audit: {
    action: 'application.hire_dates_updated',
    target: (input) => ({ type: 'application', id: input.applicationId }),
    metadata: (input) => ({
      ...(input.offerAcceptedOn === undefined ? {} : { offerAcceptedOn: input.offerAcceptedOn }),
      ...(input.startOn === undefined ? {} : { startOn: input.startOn }),
    }),
  },
  handler: async ({ deps, actor, input }): Promise<ApplicationCardView> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    if (application.outcome !== 'hired') throw new ConflictError('Only a hired application has offer and start dates.');
    const dates = resolveHireDates(application, input);
    const saved = await deps.applications.update(actor.organizationId, application.id, { ...dates, updatedAt: deps.now() });
    return loadCardView(deps, saved);
  },
});
