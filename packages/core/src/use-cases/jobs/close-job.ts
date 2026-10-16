import type { Job } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineJobUseCase } from './define.js';

/**
 * Only from `published`, and only when no application is still open (PRODUCT.md §2, principle 3): a person decides each one
 * first (`decideApplications` closes them in bulk). A closed ad is never reopened.
 */
export const closeJob = defineJobUseCase({
  name: 'closeJob',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:close',
  audit: { action: 'job.closed', target: (_input, job: Job) => ({ type: 'job', id: job.id }) },
  handler: async ({ deps, actor, input }): Promise<Job> => {
    // The row lock waits for any application being added to the job (it holds a share lock) and keeps new ones out
    // until the close commits, so the count below cannot miss one.
    const job = await deps.jobs.lock(actor.organizationId, input.jobId, 'update');
    if (!job) throw new NotFoundError('Job not found.');
    if (job.status !== 'published') throw new ConflictError('Only a published job can be closed.');
    const open = Object.values(await deps.applicationCounts.openByStage(actor.organizationId, job.id)).reduce((sum, n) => sum + n, 0);
    if (open > 0) throw new ValidationError([{ path: 'applications', message: `open_applications:${open}` }]);
    const now = deps.now();
    const saved = await deps.jobs.transition(actor.organizationId, job.id, 'published', { status: 'closed', closedAt: now, updatedAt: now });
    await recordEvent(deps, saved.organizationId, 'job.closed', { jobId: saved.id });
    return saved;
  },
});
