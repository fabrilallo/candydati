import { jobContentSchema, pipelineStagesOf, type Job } from '@tt/domain';
import { z } from 'zod';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import type { JobDeps } from '../../job-ports.js';
import { recordEvent } from '../webhooks/record-event.js';
import { defineJobUseCase } from './define.js';
import { approvalIssueOf, assertNoOpenStageRemoved, assertPublishable, requireJob, withStageIds } from './shared.js';

/** A rule of a stage that no longer exists could never run: it goes with the stage. */
async function removeRulesOfRemovedStages(deps: JobDeps, before: Job, after: Job['content']): Promise<void> {
  const kept = new Set(pipelineStagesOf(after.process).map((stage) => stage.id));
  const removed = pipelineStagesOf(before.content.process).filter((stage) => !kept.has(stage.id)).map((stage) => stage.id);
  if (removed.length > 0) await deps.automationRules.deleteByStages(before.organizationId, before.id, removed);
}

/** A live ad stays publishable, and inside the approved budget when the organization requires approval. */
async function assertStillPublishable(deps: JobDeps, job: Job, content: Job['content']): Promise<void> {
  assertPublishable(content);
  const approvalIssue = await approvalIssueOf(deps, job.organizationId, job.id, content);
  if (approvalIssue !== null) throw new ValidationError([{ path: 'approval', message: approvalIssue }]);
}

const inputSchema = z.object({ jobId: z.string().min(1), content: jobContentSchema });

/**
 * Full replacement of the content. The slug never changes (it is the public URL). Stages keep their ids, so
 * reordering and renaming never move candidates; a stage with open applications cannot be removed, and removing a stage removes its automation rules.
 * The assistant (an agent actor) edits drafts only.
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
    if (actor.type === 'agent' && job.status !== 'draft') throw new ForbiddenError('The assistant edits drafts only; a person edits published ads.');
    const content = withStageIds(input.content, deps.newId);
    if (job.status === 'published') await assertStillPublishable(deps, job, content);
    await assertNoOpenStageRemoved(deps, job, content);
    // Written only while the job keeps the status read above: an edit never revives a job closed or published meanwhile.
    const saved = await deps.jobs.updateContent(job.organizationId, job.id, job.status, { content, updatedAt: deps.now() });
    await removeRulesOfRemovedStages(deps, job, content);
    // What readers see changed: webhooks and the distribution sync hear about it. A draft is not visible to anyone.
    if (saved.status === 'published') await recordEvent(deps, saved.organizationId, 'job.updated', { jobId: saved.id, slug: saved.slug });
    return saved;
  },
});
