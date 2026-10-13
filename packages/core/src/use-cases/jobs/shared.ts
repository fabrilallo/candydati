import {
  checkPublishable,
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
