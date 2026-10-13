import type { Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { defineJobUseCase } from './define.js';
import { requireJob } from './shared.js';

/** Only from `published`. A closed ad is never reopened. */
export const closeJob = defineJobUseCase({
  name: 'closeJob',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:close',
  audit: { action: 'job.closed', target: (_input, job: Job) => ({ type: 'job', id: job.id }) },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status !== 'published') throw new ConflictError('Only a published job can be closed.');
    const now = deps.now();
    return deps.jobs.save({ ...job, status: 'closed', closedAt: now, updatedAt: now });
  },
});
