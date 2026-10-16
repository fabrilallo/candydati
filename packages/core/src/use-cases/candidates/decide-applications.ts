import { BULK_MESSAGE_MAX, OUTCOMES } from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor } from '../../actor.js';
import { ConflictError } from '../../errors.js';
import { closeApplication } from './decide-application.js';
import { defineCandidateUseCase } from './define.js';
import { requireApplication } from './shared.js';
import { mapSequential } from '../../sequential.js';

export interface BulkDecisionResult {
  readonly decided: number;
}

/**
 * The same decision for many applications (closing a job: "Non selezionato" for everyone still open). Everything is
 * checked before anything is written, so one decided or foreign id refuses the whole batch. One
 * `application.decided` audit event per application, like the single decision. One transaction: all of them or none.
 */
export const decideApplications = defineCandidateUseCase({
  name: 'decideApplications',
  input: z.object({
    applicationIds: z.array(z.string().min(1)).min(1).max(BULK_MESSAGE_MAX),
    outcome: z.enum(OUTCOMES),
  }),
  permission: 'candidate:decide',
  audit: { skip: 'one application.decided event per application, appended by the handler' },
  transaction: 'required',
  handler: async ({ deps, actor, input }): Promise<BulkDecisionResult> => {
    const ids = [...new Set(input.applicationIds)];
    const applications = await mapSequential(ids, (id) => requireApplication(deps, actor.organizationId, id));
    if (applications.some((application) => application.outcome !== null)) {
      throw new ConflictError('At least one application is already decided.');
    }
    for (const application of applications) {
      await closeApplication(deps, application, input.outcome, actor.type);
      await deps.auditLog.append({
        organizationId: actor.organizationId,
        actor: toAuditActor(actor),
        action: 'application.decided',
        target: { type: 'application', id: application.id },
        metadata: { outcome: input.outcome, bulk: true },
      });
    }
    return { decided: applications.length };
  },
});
