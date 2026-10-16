import { computeResponseDueAt, pipelineStagesOf, type Application } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { enqueueAutomations } from '../automations/enqueue.js';
import { toAuditActor, type Actor } from '../../actor.js';
import type { CandidateDeps } from '../../candidate-ports.js';
import { afterCommitOrNow, baseDeps } from '../../transaction.js';
import { trackStageEntry } from '../reports/tracking.js';
import { requestFeedbackOnStageEntry } from '../feedback/request-on-stage-entry.js';
import { requireJob } from '../jobs/shared.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineCandidateUseCase } from './define.js';
import { loadCardView, requireApplication } from './shared.js';
import type { MoveApplicationResult } from './views.js';

/** After the commit, with the dependencies outside the transaction: emails to interviewers never go out for a rolled back move. */
async function requestFeedbackAfterCommit(deps: CandidateDeps, application: Application, actor: Actor): Promise<void> {
  const base = baseDeps(deps);
  const feedback = base.feedback;
  if (!feedback) return;
  await afterCommitOrNow(deps, async () => {
    await requestFeedbackOnStageEntry(
      { ...base, ...feedback },
      {
        organizationId: application.organizationId,
        applicationId: application.id,
        stageId: application.stageId,
        actor: toAuditActor(actor),
        requestedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      },
    );
  });
}

/** Between the stages of the job's declared process, only while the application is open. Restarts the response clock. */
export const moveApplication = defineCandidateUseCase({
  name: 'moveApplication',
  input: z.object({ applicationId: z.string().min(1), stageId: z.string().min(1) }),
  permission: 'candidate:move',
  audit: {
    action: 'application.moved',
    target: (input) => ({ type: 'application', id: input.applicationId }),
    metadata: (_input, result: MoveApplicationResult) => ({ from: result.from, to: result.application.stageId }),
  },
  handler: async ({ deps, actor, input }): Promise<MoveApplicationResult> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    if (application.outcome !== null) throw new ConflictError('The application is already decided.');
    const job = await requireJob(deps, actor.organizationId, application.jobId);
    if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === input.stageId)) {
      throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    }
    if (application.stageId === input.stageId) throw new ValidationError([{ path: 'stageId', message: 'already_in_stage' }]);
    const now = deps.now();
    // A move starts a new stage and a new promise: the clock restarts and "answered" is reset. Guarded on the stage it
    // was read in: a concurrent decision or move wins and this one is refused, never written over it.
    const saved = await deps.applications.transition(actor.organizationId, application.id, { stageId: application.stageId }, {
      stageId: input.stageId,
      stageChangedAt: now,
      updatedAt: now,
      responseDueAt: computeResponseDueAt(now, job),
      respondedAt: null,
    });
    await trackStageEntry(deps, saved, application.stageId, actor.type);
    await recordEvent(deps, saved.organizationId, 'application.moved', {
      applicationId: saved.id,
      jobId: saved.jobId,
      from: application.stageId,
      to: saved.stageId,
    });
    await enqueueAutomations(deps, saved.organizationId, saved.id, saved.stageId);
    await requestFeedbackAfterCommit(deps, saved, actor);
    return { ...(await loadCardView(deps, saved)), from: application.stageId };
  },
});
