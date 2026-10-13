import { jobContentSchema, type Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { defineJobUseCase } from './define.js';
import { assertNoOpenStageRemoved, assertPublishable, requireJob, withStageIds } from './shared.js';

const inputSchema = z.object({ jobId: z.string().min(1), content: jobContentSchema });

/**
 * Full replacement of the content. The slug never changes (it is the public URL). Stages keep their ids, so
 * reordering and renaming never move candidates; a stage with open applications cannot be removed.
 */
export const updateJob = defineJobUseCase({
  name: 'updateJob',
  input: inputSchema,
  permission: 'job:update',
  audit: {
    action: 'job.updated',
    target: (_input, job: Job) => ({ type: 'job', id: job.id }),
    metadata: (_input, job: Job) => ({ title: job.content.title }),
  },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status === 'closed') throw new ConflictError('A closed job cannot be edited.');
    const content = withStageIds(input.content, deps.newId);
    if (job.status === 'published') assertPublishable(content);
    await assertNoOpenStageRemoved(deps, job, content);
    return deps.jobs.save({ ...job, content, updatedAt: deps.now() });
  },
});
