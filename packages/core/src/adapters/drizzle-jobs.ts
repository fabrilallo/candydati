import { and, count, desc, eq, schema, type Db } from '@tt/db';
import { adQualityReportSchema, jobContentSchema, type Job } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { JobListQuery, JobRepository } from '../job-ports.js';

type Row = typeof schema.job.$inferSelect;

/** jsonb is a boundary: content and quality are parsed on every read. */
const toJob = (row: Row): Job => ({
  id: row.id,
  organizationId: row.organizationId,
  slug: row.slug,
  status: row.status,
  content: jobContentSchema.parse(row.content),
  quality: row.quality === null ? null : adQualityReportSchema.parse(row.quality),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  publishedAt: row.publishedAt,
  closedAt: row.closedAt,
});

const toValues = (job: Job) => ({
  id: job.id,
  organizationId: job.organizationId,
  slug: job.slug,
  status: job.status,
  title: job.content.title,
  content: job.content,
  quality: job.quality,
  createdBy: job.createdBy,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  publishedAt: job.publishedAt,
  closedAt: job.closedAt,
});

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (error: unknown): boolean => {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
};

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleJobs(db: Db): JobRepository {
  const { job } = schema;
  const one = async (where: ReturnType<typeof and>): Promise<Job | null> => {
    const [row] = await db.select().from(job).where(where).limit(1);
    return row ? toJob(row) : null;
  };
  return {
    async create(input) {
      try {
        const [row] = await db.insert(job).values(toValues(input)).returning();
        if (!row) throw new Error('job insert returned no row');
        return toJob(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('A job with this slug already exists.');
        throw error;
      }
    },

    findById: (organizationId, id) => one(and(eq(job.organizationId, organizationId), eq(job.id, id))),

    async save(input) {
      const { id, organizationId, ...values } = toValues(input);
      const [row] = await db
        .update(job)
        .set(values)
        .where(and(eq(job.organizationId, organizationId), eq(job.id, id)))
        .returning();
      if (!row) throw new Error('job not found for save');
      return toJob(row);
    },

    async list(query: JobListQuery) {
      const where = and(
        eq(job.organizationId, query.organizationId),
        query.status === undefined ? undefined : eq(job.status, query.status),
      );
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(job)
          .where(where)
          .orderBy(desc(job.updatedAt), desc(job.id))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db.select({ total: count() }).from(job).where(where),
      ]);
      return { items: rows.map(toJob), total: totals[0]?.total ?? 0 };
    },

    async listPublished(organizationId) {
      const rows = await db
        .select()
        .from(job)
        .where(and(eq(job.organizationId, organizationId), eq(job.status, 'published')))
        .orderBy(desc(job.publishedAt), desc(job.id));
      return rows.map(toJob);
    },

    findPublishedBySlug: (organizationId, slug) =>
      one(and(eq(job.organizationId, organizationId), eq(job.slug, slug), eq(job.status, 'published'))),
  };
}
