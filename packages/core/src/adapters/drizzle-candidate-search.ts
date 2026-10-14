import { and, asc, eq, gt, schema, sql, type SQL } from '@tt/db';
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
    or candidate_tags_text(${candidate.tags}) ilike ${like}
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

/** Applications of the outer candidate in `jobIds` (per-job access); no filter when absent. */
const inJobs = (jobIds: readonly string[] | undefined): SQL =>
  jobIds === undefined ? sql`true` : jobIds.length === 0 ? sql`false` : sql`"application"."job_id" in (${sql.join(jobIds.map((id) => sql`${id}`), sql`, `)})`;

function filtersOf(query: CandidateSearchQuery): SQL | undefined {
  const text = query.query?.trim() ?? '';
  return and(
    eq(candidate.organizationId, query.organizationId),
    // Imported people who have not reconfirmed are visible only in the pipeline of their import job.
    sql`(
      exists (select 1 from ${application} where "application"."candidate_id" = ${outer.id} and "application"."organization_id" = ${outer.organizationId} and "application"."consent_status" = 'given')
      or not exists (select 1 from ${application} where "application"."candidate_id" = ${outer.id} and "application"."organization_id" = ${outer.organizationId} and "application"."consent_status" = 'to_renew')
    )`,
    query.jobIds === undefined
      ? undefined
      : sql`exists (select 1 from ${application} where "application"."candidate_id" = ${outer.id} and "application"."organization_id" = ${outer.organizationId} and ${inJobs(query.jobIds)})`,
    query.talentPool === undefined ? undefined : eq(candidate.talentPool, query.talentPool),
    query.tag === undefined ? undefined : sql`${query.tag} = any(${candidate.tags})`,
    text === '' ? undefined : textFilter(text),
  );
}

/**
 * Deepest row a page may start at. Offsets scan and discard every skipped row, so a crawler asking for page 100000
 * would cost a full scan; deeper pages are empty (the total is still reported). Narrow the filters instead.
 */
export const MAX_SEARCH_OFFSET = 10_000;

/**
 * Postgres implementation. Most recently applied first (`candidate.last_applied_at`, kept by a trigger and indexed),
 * name/email/tags matched through `pg_trgm` GIN indexes. The total comes from `count(*) over ()` in the same query;
 * only a page past the end needs a second one. Every statement filters by `organization_id`.
 */
export function createDrizzleCandidateSearch(db: DbExecutor): CandidateSearch {
  const applicationCount = (jobIds: readonly string[] | undefined) =>
    sql<number>`(select count(*)::int from ${application} where "application"."candidate_id" = ${outer.id} and "application"."consent_status" = 'given' and ${inJobs(jobIds)})`;
  const total = sql<number>`count(*) over ()::int`;
  return {
    async listAfter(organizationId, afterId, limit) {
      const rows = await db
        .select({ candidate })
        .from(candidate)
        .where(and(filtersOf({ organizationId, page: 1, limit }), afterId === null ? undefined : gt(candidate.id, afterId)))
        .orderBy(asc(candidate.id))
        .limit(limit);
      return rows.map((row) => toCandidate(row.candidate));
    },
    async search(query) {
      const where = filtersOf(query);
      const offset = (query.page - 1) * query.limit;
      const countAll = async (): Promise<number> => {
        const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(candidate).where(where);
        return row?.total ?? 0;
      };
      if (offset > MAX_SEARCH_OFFSET) return { items: [], total: await countAll() };
      const rows = await db
        .select({ candidate, applicationCount: applicationCount(query.jobIds), total })
        .from(candidate)
        .where(where)
        .orderBy(sql`${candidate.lastAppliedAt} desc nulls last`, candidate.id)
        .limit(query.limit)
        .offset(offset);
      return {
        items: rows.map((row) => ({
          candidate: toCandidate(row.candidate),
          applicationCount: row.applicationCount,
          lastAppliedAt: row.candidate.lastAppliedAt === null ? null : new Date(row.candidate.lastAppliedAt),
        })),
        total: rows[0]?.total ?? (offset === 0 ? 0 : await countAll()),
      };
    },
  };
}
