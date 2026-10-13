import type { Job, JobTemplate } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type {
  JobRepository,
  JobTemplateRepository,
  OrganizationDirectory,
  PublicOrganization,
} from '../job-ports.js';

const byDateDesc = (field: 'updatedAt' | 'publishedAt') => (a: Job, b: Job) =>
  (b[field]?.getTime() ?? 0) - (a[field]?.getTime() ?? 0);

export interface InMemoryJobRepository extends JobRepository {
  snapshot(): readonly Job[];
}

export function createInMemoryJobRepository(initial: readonly Job[] = []): InMemoryJobRepository {
  let rows: readonly Job[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((j) => j.organizationId === organizationId);
  return {
    async create(job) {
      if (inOrg(job.organizationId).some((j) => j.slug === job.slug)) throw new ConflictError('Slug already used.');
      rows = [...rows, job];
      return job;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((j) => j.id === id) ?? null;
    },
    async save(job) {
      rows = rows.map((j) => (j.organizationId === job.organizationId && j.id === job.id ? job : j));
      return job;
    },
    async list(query) {
      const matching = inOrg(query.organizationId)
        .filter((j) => query.status === undefined || j.status === query.status)
        .toSorted(byDateDesc('updatedAt'));
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    async listPublished(organizationId) {
      return inOrg(organizationId)
        .filter((j) => j.status === 'published')
        .toSorted(byDateDesc('publishedAt'));
    },
    async findPublishedBySlug(organizationId, slug) {
      return inOrg(organizationId).find((j) => j.slug === slug && j.status === 'published') ?? null;
    },
    snapshot: () => [...rows],
  };
}

export function createInMemoryJobTemplateRepository(initial: readonly JobTemplate[] = []): JobTemplateRepository {
  let rows: readonly JobTemplate[] = [...initial];
  return {
    async create(template) {
      rows = [...rows, template];
      return template;
    },
    async list(organizationId) {
      return rows.filter((t) => t.organizationId === organizationId);
    },
    async findById(organizationId, id) {
      return rows.find((t) => t.organizationId === organizationId && t.id === id) ?? null;
    },
    async delete(organizationId, id) {
      const exists = rows.some((t) => t.organizationId === organizationId && t.id === id);
      rows = rows.filter((t) => !(t.organizationId === organizationId && t.id === id));
      return exists;
    },
  };
}

export function createInMemoryOrganizationDirectory(organizations: readonly PublicOrganization[] = []): OrganizationDirectory {
  return {
    async findBySlug(slug) {
      return organizations.find((o) => o.slug === slug) ?? null;
    },
  };
}
