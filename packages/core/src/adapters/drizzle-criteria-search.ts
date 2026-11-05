import { and, eq, inArray, schema, sql, type SQL } from '@candydati/db';
import { cvExtractionSchema, cvMatchesCriteria, needsStructuredCv, SKILL_FOLD_FROM, SKILL_FOLD_TO, skillMatchesOf, termPattern, type CandidateCriteria, type SkillBook, type SkillMatch } from '@candydati/domain';
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

/** SQL twin of `normalizeSkill`: lower case, folded diacritics, only letters, digits, `+` and `#` kept. */
const skillKeyOf = (element: SQL): SQL => sql`regexp_replace(translate(lower(${element}), ${SKILL_FOLD_FROM}, ${SKILL_FOLD_TO}), '[^[:alnum:]+#]', '', 'g')`;
const isOneOf = (value: SQL, keys: readonly string[]): SQL => sql`${value} in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`;

/** A skill under any of its known names among the CV skills, or a non-ordinary-word form in the text (`hasSkill`). */
function skillMatches(skill: string, book: SkillBook): SQL {
  const listed = inList('skills', (element) => isOneOf(skillKeyOf(element), book.keys(skill)));
  const prose = book.proseTerms(skill).map(inText);
  return sql`(${sql.join([listed, ...prose], sql` or `)})`;
}

const contains = (haystack: SQL, needle: string): SQL => sql`position(lower(${needle}) in lower(${haystack})) > 0`;

/** One CV row (`cv_extraction`) satisfying every criterion: the SQL form of `cvMatchesCriteria`. */
function cvMatches(criteria: CandidateCriteria, book: SkillBook): SQL {
  const conditions: SQL[] = [
    needsStructuredCv(criteria) ? sql`"cv_extraction"."status" = 'done' and "cv_extraction"."data" is not null` : sql`"cv_extraction"."status" in ('done', 'text_only')`,
    ...criteria.skills.map((skill) => skillMatches(skill, book)),
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

/**
 * For the candidates of one page, the skill criteria their CV met under another name. The SQL above decided who
 * matches; this reads their few CVs again and asks the reference semantics (`skillMatchesOf`) which spelling it was.
 */
async function skillMatchNotes(db: DbExecutor, query: CriteriaSearchQuery, candidateIds: readonly string[]): Promise<ReadonlyMap<string, readonly SkillMatch[]>> {
  if (query.criteria.skills.length === 0 || candidateIds.length === 0) return new Map();
  const { application, cvExtraction } = schema;
  const rows = await db
    .select({ candidateId: application.candidateId, status: cvExtraction.status, text: cvExtraction.text, data: cvExtraction.data })
    .from(application)
    .innerJoin(cvExtraction, and(eq(cvExtraction.applicationId, application.id), eq(cvExtraction.organizationId, application.organizationId)))
    .where(and(eq(application.organizationId, query.organizationId), eq(application.consentStatus, 'given'), inArray(application.candidateId, [...candidateIds])));
  const notes = new Map<string, readonly SkillMatch[]>();
  for (const row of rows) {
    if (notes.has(row.candidateId)) continue;
    const parsed = row.data === null ? null : cvExtractionSchema.safeParse(row.data);
    const cv = { status: row.status, text: row.text, data: parsed?.success ? parsed.data : null };
    if (cvMatchesCriteria(cv, query.criteria, query.skills)) notes.set(row.candidateId, skillMatchesOf(cv, query.criteria, query.skills));
  }
  return notes;
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
        total: sql<number>`count(*) filter (where ${cvExists(cvMatches(query.criteria, query.skills))})::int`,
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
      .where(and(pool, cvExists(cvMatches(query.criteria, query.skills))))
      .orderBy(sql`${lastAppliedAt} desc nulls last`, candidate.id)
      .limit(query.limit)
      .offset(offset);
    const notes = await skillMatchNotes(db, query, rows.map((row) => row.candidate.id));
    return {
      items: rows.map((row) => ({
        candidate: toCandidate(row.candidate),
        applicationId: row.applicationId,
        lastAppliedAt: row.lastAppliedAt === null ? null : new Date(row.lastAppliedAt),
        skillMatches: notes.get(row.candidate.id) ?? [],
      })),
      total: counts?.total ?? 0,
      notEvaluable: counts?.notEvaluable ?? 0,
    };
  };
}
