import type { Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineJobUseCase } from './define.js';
import { requireJob } from './shared.js';

/**
 * Only from `published`, and only when no application is still open (PLAN §1, principle 3): a person decides each one
 * first (`decideApplications` closes them in bulk). A closed ad is never reopened.
 */
export const closeJob = defineJobUseCase({
  name: 'closeJob',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:close',
  audit: { action: 'job.closed', target: (_input, job: Job) => ({ type: 'job', id: job.id }) },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (job.status !== 'published') throw new ConflictError('Only a published job can be closed.');
    const open = Object.values(await deps.applicationCounts.openByStage(actor.organizationId, job.id)).reduce((sum, n) => sum + n, 0);
    if (open > 0) throw new ValidationError([{ path: 'applications', message: `open_applications:${open}` }]);
    const now = deps.now();
    const saved = await deps.jobs.save({ ...job, status: 'closed', closedAt: now, updatedAt: now });
    await recordEvent(deps, saved.organizationId, 'job.closed', { jobId: saved.id });
    return saved;
  },
});
