import { JOB_STATUSES, type Job, type JobStatus, type JobTemplate } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import { bucketByWeek } from '../use-cases/jobs/job-stats-weeks.js';
import type {
  JobRepository,
  JobTemplateRepository,
  OrganizationDirectory,
  PublicOrganization,
} from '../job-ports.js';
import { cell } from './in-memory-transaction.js';

const byDateDesc = (field: 'updatedAt' | 'publishedAt') => (a: Job, b: Job) =>
  (b[field]?.getTime() ?? 0) - (a[field]?.getTime() ?? 0);

export interface InMemoryJobRepository extends JobRepository {
  snapshot(): readonly Job[];
}

export function createInMemoryJobRepository(initial: readonly Job[] = []): InMemoryJobRepository {
  const rows = cell<readonly Job[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((j) => j.organizationId === organizationId);
  const replace = (job: Job): Job => {
    rows.set(rows.get().map((j) => (j.organizationId === job.organizationId && j.id === job.id ? job : j)));
    return job;
  };
  return {
    async create(job) {
      if (inOrg(job.organizationId).some((j) => j.slug === job.slug)) throw new ConflictError('Slug already used.');
      rows.set([...rows.get(), job]);
      return job;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((j) => j.id === id) ?? null;
    },
    async lock(organizationId, id) {
      return inOrg(organizationId).find((j) => j.id === id) ?? null;
    },
    async updateContent(organizationId, id, expectedStatus, patch) {
      const current = inOrg(organizationId).find((j) => j.id === id);
      if (!current || current.status !== expectedStatus) throw new ConflictError('The job changed meanwhile.');
      return replace({ ...current, ...patch });
    },
    async transition(organizationId, id, from, patch) {
      const current = inOrg(organizationId).find((j) => j.id === id);
      if (!current || current.status !== from) throw new ConflictError('The job changed meanwhile.');
      return replace({ ...current, ...patch });
    },
    async list(query) {
      const matching = inOrg(query.organizationId)
        .filter((j) => query.status === undefined || j.status === query.status)
        .filter((j) => query.jobIds === undefined || query.jobIds.includes(j.id))
        .toSorted(byDateDesc('updatedAt'));
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    async listAfter(organizationId, afterId, limit) {
      return inOrg(organizationId)
        .filter((j) => afterId === null || j.id > afterId)
        .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit);
    },
    async listPublished(organizationId) {
      return inOrg(organizationId)
        .filter((j) => j.status === 'published')
        .toSorted(byDateDesc('publishedAt'));
    },
    async findPublishedBySlug(organizationId, slug) {
      return inOrg(organizationId).find((j) => j.slug === slug && j.status === 'published') ?? null;
    },
    async countByStatus(organizationId) {
      const jobs = inOrg(organizationId);
      const countOf = (status: JobStatus) => jobs.filter((j) => j.status === status).length;
      return Object.fromEntries(JOB_STATUSES.map((status) => [status, countOf(status)])) as Record<JobStatus, number>;
    },
    async weeklyActivity(organizationId, since) {
      const jobs = inOrg(organizationId);
      return {
        created: bucketByWeek(jobs.map((j) => j.createdAt), since),
        published: bucketByWeek(jobs.map((j) => j.publishedAt), since),
      };
    },
    async listByStatus(organizationId, status) {
      return inOrg(organizationId)
        .filter((j) => j.status === status)
        .toSorted(byDateDesc('updatedAt'));
    },
    snapshot: () => [...rows.get()],
  };
}

export function createInMemoryJobTemplateRepository(initial: readonly JobTemplate[] = []): JobTemplateRepository {
  const rows = cell<readonly JobTemplate[]>([...initial]);
  return {
    async create(template) {
      rows.set([...rows.get(), template]);
      return template;
    },
    async list(organizationId) {
      return rows.get().filter((t) => t.organizationId === organizationId);
    },
    async findById(organizationId, id) {
      return rows.get().find((t) => t.organizationId === organizationId && t.id === id) ?? null;
    },
    async delete(organizationId, id) {
      const exists = rows.get().some((t) => t.organizationId === organizationId && t.id === id);
      rows.set(rows.get().filter((t) => !(t.organizationId === organizationId && t.id === id)));
      return exists;
    },
  };
}

export function createInMemoryOrganizationDirectory(organizations: readonly PublicOrganization[] = []): OrganizationDirectory {
  return {
    async findBySlug(slug) {
      return organizations.find((o) => o.slug === slug) ?? null;
    },
    async findById(id) {
      return organizations.find((o) => o.id === id) ?? null;
    },
  };
}
