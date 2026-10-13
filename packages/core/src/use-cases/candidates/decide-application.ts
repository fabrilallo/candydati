import { OUTCOMES } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { loadCardView, requireApplication } from './shared.js';
import type { ApplicationCardView } from './views.js';

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
    if (application.outcome !== null) throw new ConflictError('The application is already decided.');
    const now = deps.now();
    const saved = await deps.applications.save({ ...application, outcome: input.outcome, closedAt: now, updatedAt: now });
    return loadCardView(deps, saved);
  },
});
