import { pipelineStagesOf } from '@tt/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineCandidateUseCase } from './define.js';
import { loadCardView, requireApplication } from './shared.js';
import type { MoveApplicationResult } from './views.js';

/** Between the stages of the job's declared process, only while the application is open. */
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
    const saved = await deps.applications.save({ ...application, stageId: input.stageId, stageChangedAt: now, updatedAt: now });
    return { ...(await loadCardView(deps, saved)), from: application.stageId };
  },
});
