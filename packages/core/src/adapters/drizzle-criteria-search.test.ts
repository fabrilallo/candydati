import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { candidateCriteriaSchema, type Application, type Candidate, type CvExtractionRecord } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CandidateSearch, CriteriaSearchQuery } from '../candidate-ports.js';
import { buildApplication, buildCandidate, buildExtraction, buildJob } from '../testing/index.js';
import { createCandidateStore } from '../testing/in-memory-candidates.js';
import { findByCriteriaInMemory } from '../testing/in-memory-criteria-search.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateSearch } from './drizzle-candidate-search.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;
let search: CandidateSearch;
let org: string;
let jobA: string;
let jobB: string;
const ids: Record<string, string> = {};
const candidates: Candidate[] = [];
const applications: Application[] = [];
const extractions: CvExtractionRecord[] = [];

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Org ${id}`, slug: id, createdAt: new Date() });
  return id;
};
const insertJob = async (organizationId: string): Promise<string> => {
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId, status: 'published', publishedAt: new Date() });
  return (await createDrizzleJobs(handle.db).create(job)).id;
};

interface Seed {
  readonly key: string;
  readonly organizationId?: string;
  readonly job: () => string;
  readonly talentPool?: boolean;
  readonly consent?: 'given' | 'to_renew';
  readonly cv: Partial<CvExtractionRecord> | null;
  readonly day: number;
}

const structured = { headline: 'Developer', location: 'Milano', yearsOfExperience: 5, experiences: [], education: [], skills: ['TypeScript', 'Vue'], languages: ['Inglese C1'] };

const seeds = (): readonly Seed[] => [
  { key: 'ada', job: () => jobA, cv: { status: 'done', text: 'Node.js e C++ in produzione', data: structured }, day: 5 },
  { key: 'bob', job: () => jobB, talentPool: true, cv: { status: 'text_only', text: 'TypeScript e Postgres', data: null, source: 'text' }, day: 4 },
  // Consent for job B only, not in the talent pool: never part of a search for job A.
  { key: 'cleo', job: () => jobB, cv: { status: 'done', text: 'TypeScript', data: structured }, day: 3 },
  { key: 'dan', job: () => jobA, cv: { status: 'failed', text: null, data: null, source: null }, day: 2 },
  { key: 'eve', job: () => jobA, consent: 'to_renew', cv: { status: 'done', text: 'TypeScript', data: structured }, day: 1 },
];

async function seedOne(seed: Seed, organizationId: string): Promise<void> {
  const candidate = await createDrizzleCandidates(handle.db).create(
    buildCandidate({ id: randomUUID(), organizationId, email: `${randomUUID()}@x.it`, talentPool: seed.talentPool ?? false }),
  );
  const application = await createDrizzleApplications(handle.db).create(
    buildApplication({ id: randomUUID(), organizationId, jobId: seed.job(), candidateId: candidate.id, consentStatus: seed.consent ?? 'given', createdAt: new Date(2026, 0, seed.day) }),
  );
  ids[seed.key] = candidate.id;
  candidates.push(candidate);
  applications.push(application);
  if (seed.cv) {
    const cv = buildExtraction({ applicationId: application.id, organizationId, ...seed.cv });
    await createDrizzleCvExtractions(handle.db).upsert(cv);
    extractions.push(cv);
  }
}

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 4);
  org = await insertOrg();
  jobA = await insertJob(org);
  jobB = await insertJob(org);
  for (const seed of seeds()) await seedOne(seed, org);
  const other = await insertOrg();
  const otherJob = await insertJob(other);
  const before = candidates.length;
  await seedOne({ key: 'stranger', job: () => otherJob, talentPool: true, cv: { status: 'done', text: 'TypeScript', data: structured }, day: 9 }, other);
  candidates.splice(before);
  search = createDrizzleCandidateSearch(handle.db);
});
afterAll(async () => handle.close());

const query = (criteria: unknown, extra: Partial<CriteriaSearchQuery> = {}): CriteriaSearchQuery => ({
  organizationId: org,
  jobId: jobA,
  pool: 'both',
  criteria: candidateCriteriaSchema.parse(criteria),
  page: 1,
  limit: 25,
  ...extra,
});

/** Postgres and the in-memory twin give the same answer: the twin is what the use case tests rely on. */
async function run(q: CriteriaSearchQuery): Promise<{ readonly keys: readonly string[]; readonly total: number; readonly notEvaluable: number }> {
  const result = await search.findByCriteria(q);
  const twin = findByCriteriaInMemory(createCandidateStore({ candidates, applications, extractions }).read(), q);
  const keyOf = (id: string): string => Object.keys(ids).find((key) => ids[key] === id) ?? id;
  const keys = result.items.map((item) => keyOf(item.candidate.id));
  expect({ keys, total: result.total, notEvaluable: result.notEvaluable }).toEqual({
    keys: twin.items.map((item) => keyOf(item.candidate.id)),
    total: twin.total,
    notEvaluable: twin.notEvaluable,
  });
  return { keys, total: result.total, notEvaluable: result.notEvaluable };
}

describe('createDrizzleCriteriaSearch', () => {
  it('looks at the applicants of the job and the talent pool only, most recently applied first', async () => {
    expect(await run(query({ skills: ['typescript'] }))).toEqual({ keys: ['ada', 'bob'], total: 2, notEvaluable: 1 });
    expect((await run(query({ skills: ['TypeScript'] }, { pool: 'applicants' }))).keys).toEqual(['ada']);
    expect((await run(query({ skills: ['TypeScript'] }, { pool: 'talent_pool' }))).keys).toEqual(['bob']);
  });

  it('matches whole words in the text, structured lists, experience and location', async () => {
    expect((await run(query({ skills: ['C++'], keywords: ['node.js'] }))).keys).toEqual(['ada']);
    expect((await run(query({ skills: ['Postgres'] }))).keys).toEqual(['bob']);
    expect((await run(query({ skills: ['Post'] }))).keys).toEqual([]);
    expect((await run(query({ languages: ['inglese'], locations: ['Roma', 'milano'] }))).keys).toEqual(['ada']);
    expect(await run(query({ minYearsOfExperience: 3 }))).toEqual({ keys: ['ada'], total: 1, notEvaluable: 2 });
    expect((await run(query({ minYearsOfExperience: 6 }))).keys).toEqual([]);
  });

  it('returns the application to the job and pages the result', async () => {
    const { items } = await search.findByCriteria(query({ skills: ['TypeScript'] }));
    expect(items.map((item) => item.applicationId === null)).toEqual([false, true]);
    expect((await run(query({ skills: ['TypeScript'] }, { page: 2, limit: 1 }))).keys).toEqual(['bob']);
  });

  it('keeps to the jobs the actor reaches', async () => {
    expect((await run(query({ skills: ['TypeScript'] }, { jobIds: [jobB] }))).keys).toEqual(['bob']);
    expect((await run(query({ skills: ['TypeScript'] }, { jobIds: [] }))).keys).toEqual([]);
  });

  it('treats a regex-like term as plain text', async () => {
    expect((await run(query({ keywords: ['.*'] }))).keys).toEqual([]);
    expect((await run(query({ keywords: ['(a|b)?'] }))).keys).toEqual([]);
  });
});
