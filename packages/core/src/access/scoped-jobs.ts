import { JOB_STATUSES, type Job, type JobStatus } from '@tt/domain';
import { NotFoundError } from '../errors.js';
import type { JobRepository } from '../job-ports.js';
import type { StaleJobRepository } from '../job-request-ports.js';
import { bucketByWeek } from '../use-cases/jobs/job-stats-weeks.js';
import type { JobScopeContext } from './job-scope.js';

const notFound = (): never => {
  throw new NotFoundError('Job not found.');
};

/**
 * Jobs outside the actor's scope do not exist: reads return null or leave them out, writes fail as "not found". Lists
 * are filtered in SQL (`jobIds`); the aggregates of a scoped actor are computed from their jobs, which are few.
 */
export function scopeJobs(raw: JobRepository, ctx: JobScopeContext): JobRepository {
  const visible = async (job: Job | null): Promise<Job | null> => (job && (await ctx.allowsJob(job.id)) ? job : null);
  const keep = async (jobs: readonly Job[]): Promise<readonly Job[]> => {
    const ids = await ctx.jobIds();
    return ids === null ? jobs : jobs.filter((job) => ids.includes(job.id));
  };
  const accessible = async (organizationId: string, ids: readonly string[]): Promise<readonly Job[]> =>
    ids.length === 0 ? [] : (await raw.list({ organizationId, jobIds: ids, page: 1, limit: ids.length })).items;
  const guard = async (id: string): Promise<void> => {
    if (!(await ctx.allowsJob(id))) notFound();
  };
  return {
    create: (job) => raw.create(job),
    findById: async (organizationId, id) => visible(await raw.findById(organizationId, id)),
    lock: async (organizationId, id, mode) => ((await ctx.allowsJob(id)) ? raw.lock(organizationId, id, mode) : null),
    async updateContent(organizationId, id, expectedStatus, patch) {
      await guard(id);
      return raw.updateContent(organizationId, id, expectedStatus, patch);
    },
    async transition(organizationId, id, from, patch) {
      await guard(id);
      return raw.transition(organizationId, id, from, patch);
    },
    async list(query) {
      const ids = await ctx.jobIds();
      return raw.list(ids === null ? query : { ...query, jobIds: ids });
    },
    listAfter: async (organizationId, afterId, limit) => keep(await raw.listAfter(organizationId, afterId, limit)),
    listPublished: async (organizationId) => keep(await raw.listPublished(organizationId)),
    findPublishedBySlug: async (organizationId, slug) => visible(await raw.findPublishedBySlug(organizationId, slug)),
    async countByStatus(organizationId) {
      const ids = await ctx.jobIds();
      if (ids === null) return raw.countByStatus(organizationId);
      const jobs = await accessible(organizationId, ids);
      const countOf = (status: JobStatus) => jobs.filter((job) => job.status === status).length;
      return Object.fromEntries(JOB_STATUSES.map((status) => [status, countOf(status)])) as Record<JobStatus, number>;
    },
    async weeklyActivity(organizationId, since) {
      const ids = await ctx.jobIds();
      if (ids === null) return raw.weeklyActivity(organizationId, since);
      const jobs = await accessible(organizationId, ids);
      return { created: bucketByWeek(jobs.map((job) => job.createdAt), since), published: bucketByWeek(jobs.map((job) => job.publishedAt), since) };
    },
    listByStatus: async (organizationId, status) => keep(await raw.listByStatus(organizationId, status)),
  };
}

/** The "stalled ads" list shows only the jobs in scope. The cross-organization scan is a system job and unaffected. */
export function scopeStaleJobs(raw: StaleJobRepository, ctx: JobScopeContext): StaleJobRepository {
  return {
    async listStale(cutoff, organizationId) {
      const stale = await raw.listStale(cutoff, organizationId);
      const ids = await ctx.jobIds();
      return ids === null ? stale : stale.filter((entry) => ids.includes(entry.job.id));
    },
  };
}
