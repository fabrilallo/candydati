import { jobContentSchema, pipelineStagesOf, type Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { JobDeps } from '../../job-ports.js';
import { defineJobUseCase } from './define.js';
import { assertNoOpenStageRemoved, assertPublishable, requireJob, withStageIds } from './shared.js';

/** A rule of a stage that no longer exists could never run: it goes with the stage. */
async function removeRulesOfRemovedStages(deps: JobDeps, before: Job, after: Job['content']): Promise<void> {
  const kept = new Set(pipelineStagesOf(after.process).map((stage) => stage.id));
  const removed = pipelineStagesOf(before.content.process).filter((stage) => !kept.has(stage.id)).map((stage) => stage.id);
  if (removed.length > 0) await deps.automationRules.deleteByStages(before.organizationId, before.id, removed);
}

const inputSchema = z.object({ jobId: z.string().min(1), content: jobContentSchema });

/**
 * Full replacement of the content. The slug never changes (it is the public URL). Stages keep their ids, so
 * reordering and renaming never move candidates; a stage with open applications cannot be removed, and removing a stage removes its automation rules.
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
    const saved = await deps.jobs.save({ ...job, content, updatedAt: deps.now() });
    await removeRulesOfRemovedStages(deps, job, content);
    return saved;
  },
});
