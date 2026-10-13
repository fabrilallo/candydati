import {
  assignStageIds,
  checkApproval,
  type ApprovalRule,
  checkPublishable,
  DuplicateStageIdError,
  pipelineStagesOf,
  jobContentSchema,
  type Job,
  type JobContent,
  type PublishIssue,
} from '@tt/domain';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { JobDeps } from '../../job-ports.js';

/** A job of another organization is indistinguishable from a missing one: existence is never revealed. */
export async function requireJob(deps: Pick<JobDeps, 'jobs'>, organizationId: string, jobId: string): Promise<Job> {
  const job = await deps.jobs.findById(organizationId, jobId);
  if (!job) throw new NotFoundError('Job not found.');
  return job;
}

export const issuesToValidationError = (issues: readonly PublishIssue[]): ValidationError =>
  new ValidationError(issues.map((issue) => ({ path: issue.path, message: issue.rule })));

export function assertPublishable(content: JobContent): void {
  const issues = checkPublishable(content);
  if (issues.length > 0) throw issuesToValidationError(issues);
}

/** Parses raw content (lenient: a draft needs only a title); issue paths are prefixed with `content`. */
export function parseContent(raw: unknown): JobContent {
  const parsed = jobContentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new ValidationError(
    parsed.error.issues.map((issue) => ({ path: ['content', ...issue.path].join('.'), message: issue.message })),
  );
}

/** Gives every stage its stable id (existing ids are kept). A repeated id is a validation error. */
export function withStageIds(content: JobContent, newId: () => string): JobContent {
  try {
    // Ids are hex fragments of the generated id: letters, digits and dashes only.
    return { ...content, process: assignStageIds(content.process, () => `stg-${newId().replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8)}`) };
  } catch (error) {
    if (error instanceof DuplicateStageIdError) {
      throw new ValidationError([{ path: 'process', message: `duplicate_stage_id:${error.stageId}` }]);
    }
    throw error;
  }
}

/** One issue per stage of `before` that `after` no longer has and that still holds open applications. */
export async function assertNoOpenStageRemoved(
  deps: Pick<JobDeps, 'applicationCounts'>,
  job: Job,
  after: JobContent,
): Promise<void> {
  const kept = new Set(pipelineStagesOf(after.process).map((stage) => stage.id));
  const removed = pipelineStagesOf(job.content.process).filter((stage) => stage.declared !== null && !kept.has(stage.id));
  if (removed.length === 0) return;
  const open = await deps.applicationCounts.openByStage(job.organizationId, job.id);
  const blocked = removed.filter((stage) => (open[stage.id] ?? 0) > 0);
  if (blocked.length > 0) {
    throw new ValidationError(blocked.map((stage) => ({ path: 'process', message: `stage_has_open_applications:${stage.id}` })));
  }
}

/** Null when the organization does not require approval or the ad's salary stays inside the approved budget. */
export async function approvalIssueOf(
  deps: Pick<JobDeps, 'organizationSettings' | 'approvals'>,
  organizationId: string,
  jobId: string,
  content: JobContent,
): Promise<ApprovalRule | null> {
  const [settings, approval] = await Promise.all([deps.organizationSettings.get(organizationId), deps.approvals.find(organizationId, jobId)]);
  return checkApproval(settings.requireApproval, approval, content.salary);
}
