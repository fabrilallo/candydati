import { and, asc, count, eq, schema } from '@candydati/db';
import type { TrackedLink } from '@candydati/domain';
import type { TrackedLinkRepository } from '../tracked-link-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id` and `job_id`. */
export function createDrizzleTrackedLinks(db: DbExecutor): TrackedLinkRepository {
  const { jobTrackedLink: link } = schema;
  const ofJob = (organizationId: string, jobId: string) => and(eq(link.organizationId, organizationId), eq(link.jobId, jobId));
  const findPair = async (value: TrackedLink): Promise<TrackedLink | null> => {
    const [row] = await db
      .select()
      .from(link)
      .where(and(ofJob(value.organizationId, value.jobId), eq(link.source, value.source), eq(link.campaign, value.campaign)))
      .limit(1);
    return row ?? null;
  };
  return {
    async listByJob(organizationId, jobId) {
      return db.select().from(link).where(ofJob(organizationId, jobId)).orderBy(asc(link.createdAt), asc(link.id));
    },
    async countByJob(organizationId, jobId) {
      const [row] = await db.select({ total: count() }).from(link).where(ofJob(organizationId, jobId));
      return row?.total ?? 0;
    },
    async insertIfAbsent(value) {
      // The unique index on (organization, job, source, campaign) settles two saves of the same pair at once.
      const [inserted] = await db.insert(link).values(value).onConflictDoNothing().returning();
      if (inserted) return { link: inserted, created: true };
      const existing = await findPair(value);
      if (!existing) throw new Error('tracked link insert conflicted but no row was found');
      return { link: existing, created: false };
    },
    async remove(organizationId, jobId, linkId) {
      const rows = await db.delete(link).where(and(ofJob(organizationId, jobId), eq(link.id, linkId))).returning({ id: link.id });
      return rows.length > 0;
    },
  };
}
