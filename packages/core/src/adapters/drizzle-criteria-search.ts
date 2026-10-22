import { and, schema, sql, type SQL } from '@candydati/db';
import { needsStructuredCv, termPattern, type CandidateCriteria } from '@candydati/domain';
import type { CandidateSearch, CriteriaSearchQuery } from '../candidate-ports.js';
import { toCandidate } from './drizzle-candidates.js';
import type { DbExecutor } from './db-executor.js';

const { candidate } = schema;

/** Fully qualified, so the correlated subqueries below mean the outer candidate (see `drizzle-candidate-search.ts`). */
const outerId = sql.raw('"candidate"."id"');
const outerOrg = sql.raw('"candidate"."organization_id"');

/** Applications of the outer candidate with consent given, in this organization. */
const givenApplication = sql`"application"."candidate_id" = ${outerId} and "application"."organization_id" = ${outerOrg} and "application"."consent_status" = 'given'`;

/** The structured fields count only once the CV was structured, as in `cvMatchesCriteria`. */
const data = sql`(case when "cv_extraction"."status" = 'done' then "cv_extraction"."data" end)`;
const inText = (term: string): SQL => sql`coalesce("cv_extraction"."text", '') ~* ${termPattern(term)}`;
const inList = (field: string, condition: (element: SQL) => SQL): SQL =>
  sql`exists (select 1 from jsonb_array_elements_text(coalesce(${data} -> ${field}, '[]'::jsonb)) as element(value) where ${condition(sql`element.value`)})`;
const contains = (haystack: SQL, needle: string): SQL => sql`position(lower(${needle}) in lower(${haystack})) > 0`;

/** One CV row (`cv_extraction`) satisfying every criterion: the SQL form of `cvMatchesCriteria`. */
function cvMatches(criteria: CandidateCriteria): SQL {
  const conditions: SQL[] = [
    needsStructuredCv(criteria) ? sql`"cv_extraction"."status" = 'done' and "cv_extraction"."data" is not null` : sql`"cv_extraction"."status" in ('done', 'text_only')`,
    ...criteria.skills.map((skill) => sql`(${inList('skills', (element) => sql`lower(${element}) = lower(${skill})`)} or ${inText(skill)})`),
    ...criteria.languages.map((language) => sql`(${inList('languages', (element) => contains(element, language))} or ${inText(language)})`),
    ...criteria.keywords.map(inText),
  ];
  if (criteria.minYearsOfExperience !== undefined) {
    conditions.push(sql`jsonb_typeof(${data} -> 'yearsOfExperience') = 'number' and (${data} ->> 'yearsOfExperience')::numeric >= ${criteria.minYearsOfExperience}`);
  }
  if (criteria.locations.length > 0) {
    conditions.push(sql`(${sql.join(criteria.locations.map((place) => contains(sql`coalesce(${data} ->> 'location', '')`, place)), sql` or `)})`);
  }
  return sql.join(conditions, sql` and `);
}

const cvExists = (condition: SQL): SQL =>
  sql`exists (select 1 from "application" join "cv_extraction" on "cv_extraction"."application_id" = "application"."id" and "cv_extraction"."organization_id" = ${outerOrg} where ${givenApplication} and ${condition})`;

/** Visible (imported people who have not reconfirmed stay hidden), in scope, and in the pool asked for. */
function poolOf(query: CriteriaSearchQuery): SQL | undefined {
  const applicant = sql`exists (select 1 from "application" where ${givenApplication} and "application"."job_id" = ${query.jobId})`;
  const talentPool = sql`${candidate.talentPool} = true`;
  const pool = query.pool === 'applicants' ? applicant : query.pool === 'talent_pool' ? talentPool : sql`(${applicant} or ${talentPool})`;
  const scope =
    query.jobIds === undefined
      ? undefined
      : query.jobIds.length === 0
        ? sql`false`
        : sql`exists (select 1 from "application" where "application"."candidate_id" = ${outerId} and "application"."organization_id" = ${outerOrg} and "application"."job_id" in (${sql.join(query.jobIds.map((id) => sql`${id}`), sql`, `)}))`;
  return and(
    sql`${candidate.organizationId} = ${query.organizationId}`,
    sql`(
      exists (select 1 from "application" where "application"."candidate_id" = ${outerId} and "application"."organization_id" = ${outerOrg} and "application"."consent_status" = 'given')
      or not exists (select 1 from "application" where "application"."candidate_id" = ${outerId} and "application"."organization_id" = ${outerOrg} and "application"."consent_status" = 'to_renew')
    )`,
    scope,
    pool,
  );
}

/** Deepest row a page may start at, as for the candidate search. */
const MAX_CRITERIA_OFFSET = 10_000;

/** Postgres implementation of `CandidateSearch.findByCriteria`. Every statement filters by `organization_id`. */
export function createDrizzleCriteriaSearch(db: DbExecutor): CandidateSearch['findByCriteria'] {
  return async (query) => {
    const pool = poolOf(query);
    const evaluable = needsStructuredCv(query.criteria) ? sql`"cv_extraction"."status" = 'done'` : sql`"cv_extraction"."status" in ('done', 'text_only')`;
    const [counts] = await db
      .select({
        total: sql<number>`count(*) filter (where ${cvExists(cvMatches(query.criteria))})::int`,
        notEvaluable: sql<number>`count(*) filter (where not ${cvExists(evaluable)})::int`,
      })
      .from(candidate)
      .where(pool);
    const offset = (query.page - 1) * query.limit;
    if (offset > MAX_CRITERIA_OFFSET) return { items: [], total: counts?.total ?? 0, notEvaluable: counts?.notEvaluable ?? 0 };
    const lastAppliedAt = sql<Date | null>`(select max("application"."created_at") from "application" where ${givenApplication})`;
    const rows = await db
      .select({
        candidate,
        applicationId: sql<string | null>`(select "application"."id" from "application" where ${givenApplication} and "application"."job_id" = ${query.jobId} order by "application"."created_at" desc limit 1)`,
        lastAppliedAt,
      })
      .from(candidate)
      .where(and(pool, cvExists(cvMatches(query.criteria))))
      .orderBy(sql`${lastAppliedAt} desc nulls last`, candidate.id)
      .limit(query.limit)
      .offset(offset);
    return {
      items: rows.map((row) => ({
        candidate: toCandidate(row.candidate),
        applicationId: row.applicationId,
        lastAppliedAt: row.lastAppliedAt === null ? null : new Date(row.lastAppliedAt),
      })),
      total: counts?.total ?? 0,
      notEvaluable: counts?.notEvaluable ?? 0,
    };
  };
}
