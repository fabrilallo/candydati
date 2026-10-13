import { and, eq, schema, sql, type SQL } from '@tt/db';
import type { CandidateSearch, CandidateSearchQuery } from '../candidate-ports.js';
import { toCandidate } from './drizzle-candidates.js';
import type { DbExecutor } from './db-executor.js';

/** `%` and `_` typed by the user are literals, not wildcards. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const { candidate, application, cvExtraction } = schema;

/**
 * Inside a correlated subquery drizzle prints bare column names, which would resolve to the inner table.
 * These fully qualified references are what make `candidate.id` mean the outer row.
 */
const outer = {
  id: sql.raw('"candidate"."id"'),
  organizationId: sql.raw('"candidate"."organization_id"'),
};

/** Name or email (ILIKE), tags (ILIKE), or CV text (full-text, every word must appear). */
const textFilter = (text: string): SQL => {
  const like = `%${escapeLike(text)}%`;
  return sql`(
    ${candidate.firstName} || ' ' || ${candidate.lastName} ilike ${like}
    or ${candidate.email} ilike ${like}
    or array_to_string(${candidate.tags}, ' ') ilike ${like}
    or exists (
      select 1 from ${application}
      join ${cvExtraction} on "cv_extraction"."application_id" = "application"."id"
      where "application"."candidate_id" = ${outer.id}
        and "application"."organization_id" = ${outer.organizationId}
        and "cv_extraction"."organization_id" = ${outer.organizationId}
        and "cv_extraction"."search" @@ plainto_tsquery('simple', ${text})
    )
  )`;
};

function filtersOf(query: CandidateSearchQuery): SQL | undefined {
  const text = query.query?.trim() ?? '';
  return and(
    eq(candidate.organizationId, query.organizationId),
    query.talentPool === undefined ? undefined : eq(candidate.talentPool, query.talentPool),
    query.tag === undefined ? undefined : sql`${query.tag} = any(${candidate.tags})`,
    text === '' ? undefined : textFilter(text),
  );
}

/** Postgres implementation. Most recently applied first; every statement filters by `organization_id`. */
export function createDrizzleCandidateSearch(db: DbExecutor): CandidateSearch {
  const applicationCount = sql<number>`(select count(*)::int from ${application} where "application"."candidate_id" = ${outer.id})`;
  const lastAppliedAt = sql<Date | null>`(select max("application"."created_at") from ${application} where "application"."candidate_id" = ${outer.id})`;
  return {
    async search(query) {
      const where = filtersOf(query);
      const rows = await db
        .select({ candidate, applicationCount, lastAppliedAt })
        .from(candidate)
        .where(where)
        .orderBy(sql`${lastAppliedAt} desc nulls last`, candidate.id)
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);
      const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(candidate).where(where);
      return {
        items: rows.map((row) => ({
          candidate: toCandidate(row.candidate),
          applicationCount: row.applicationCount,
          lastAppliedAt: row.lastAppliedAt === null ? null : new Date(row.lastAppliedAt),
        })),
        total: totals?.total ?? 0,
      };
    },
  };
}
