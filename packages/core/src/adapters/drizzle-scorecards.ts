import { and, asc, eq, inArray, isNull, schema } from '@candydati/db';
import type { ScorecardCriterion } from '@candydati/domain';
import type { ScorecardRepository } from '../feedback-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`; the guarded writes decide a race with a feedback. */
export function createDrizzleScorecards(db: DbExecutor): ScorecardRepository {
  const { jobScorecardCriterion: table } = schema;
  const key = (organizationId: string, id: string) => and(eq(table.organizationId, organizationId), eq(table.id, id));
  return {
    async listByJob(organizationId, jobId): Promise<readonly ScorecardCriterion[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.organizationId, organizationId), eq(table.jobId, jobId)))
        .orderBy(asc(table.position), asc(table.createdAt), asc(table.id));
    },
    async create(criteria) {
      if (criteria.length > 0) await db.insert(table).values([...criteria]);
    },
    async updateUnused(organizationId, id, patch) {
      const rows = await db.update(table).set(patch).where(and(key(organizationId, id), isNull(table.firstUsedAt))).returning({ id: table.id });
      return rows.length > 0;
    },
    async move(organizationId, id, position) {
      await db.update(table).set({ position }).where(key(organizationId, id));
    },
    async retire(organizationId, id, at) {
      await db.update(table).set({ retiredAt: at }).where(and(key(organizationId, id), isNull(table.retiredAt)));
    },
    async removeUnused(organizationId, id) {
      const rows = await db.delete(table).where(and(key(organizationId, id), isNull(table.firstUsedAt))).returning({ id: table.id });
      return rows.length > 0;
    },
    async markUsed(organizationId, ids, at) {
      if (ids.length === 0) return;
      await db
        .update(table)
        .set({ firstUsedAt: at })
        .where(and(eq(table.organizationId, organizationId), inArray(table.id, [...ids]), isNull(table.firstUsedAt)));
    },
  };
}
