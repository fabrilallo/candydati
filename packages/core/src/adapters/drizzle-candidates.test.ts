import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildJob,
  buildNote,
  buildPrivacyNotice,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  fakePdfBytes,
  validApplicationForm,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { submitApplication } from '../use-cases/candidates/submit-application.js';
import { createDrizzleApplicationIntake } from './drizzle-application-intake.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidateSearch, escapeLike } from './drizzle-candidate-search.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleUserDirectory } from './drizzle-user-directory.js';

let handle: DbHandle;
let orgA: string;
let orgB: string;
let jobA: string;
let slugA: string;

const insertOrg = async (): Promise<{ id: string; slug: string }> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Org ${id}`, slug: id, createdAt: new Date() });
  return { id, slug: id };
};
const insertJob = async (organizationId: string, published = true): Promise<{ id: string; slug: string }> => {
  const job = buildJob({
    id: randomUUID(),
    slug: randomUUID(),
    organizationId,
    status: published ? 'published' : 'draft',
    publishedAt: published ? new Date() : null,
  });
  await createDrizzleJobs(handle.db).create(job);
  return { id: job.id, slug: job.slug };
};
const newCandidate = (organizationId: string, overrides = {}) =>
  buildCandidate({ id: randomUUID(), organizationId, email: `${randomUUID()}@x.it`, ...overrides });
const newApplication = (organizationId: string, jobId: string, candidateId: string, overrides = {}) =>
  buildApplication({ id: randomUUID(), organizationId, jobId, candidateId, ...overrides });

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 4);
  const a = await insertOrg();
  orgA = a.id;
  slugA = a.slug;
  orgB = (await insertOrg()).id;
  jobA = (await insertJob(orgA)).id;
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzlePrivacyNotices', () => {
  it('creates versions, finds the active one, lists newest first and isolates organizations', async () => {
    const repo = createDrizzlePrivacyNotices(handle.db);
    const v1 = buildPrivacyNotice({ id: randomUUID(), organizationId: orgA, version: 1 });
    const v2 = buildPrivacyNotice({ id: randomUUID(), organizationId: orgA, version: 2, language: 'en' });
    expect(await repo.findActive(orgA)).toBeNull();
    expect(await repo.create(v1)).toEqual(v1);
    await repo.create(v2);
    expect(await repo.findActive(orgA)).toEqual(v2);
    expect((await repo.list(orgA)).map((n) => n.version)).toEqual([2, 1]);
    expect(await repo.findActive(orgB)).toBeNull();
    expect(await repo.list(orgB)).toEqual([]);
  });

  it('refuses a duplicated version in the same organization', async () => {
    const repo = createDrizzlePrivacyNotices(handle.db);
    const org = (await insertOrg()).id;
    await repo.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org }));
    await expect(repo.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org }))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('createDrizzleCandidates', () => {
  it('creates, reads, saves, finds by email case-insensitively and by ids', async () => {
    const repo = createDrizzleCandidates(handle.db);
    const c = newCandidate(orgA, { email: 'Mixed.Case@X.it', tags: ['go', 'rust'], phone: '+39 02 1234567' });
    expect(await repo.create(c)).toEqual(c);
    expect(await repo.findById(orgA, c.id)).toEqual(c);
    expect(await repo.findByEmail(orgA, 'mixed.case@x.IT')).toEqual(c);
    const changed = { ...c, firstName: 'Changed', tags: ['x'], talentPool: true };
    expect(await repo.save(changed)).toEqual(changed);
    expect((await repo.findByIds(orgA, [c.id, randomUUID()])).map((x) => x.id)).toEqual([c.id]);
    expect(await repo.findByIds(orgA, [])).toEqual([]);
  });

  it('refuses a duplicate email (any case) in one organization but not across organizations', async () => {
    const repo = createDrizzleCandidates(handle.db);
    await repo.create(newCandidate(orgA, { email: 'dup@x.it' }));
    await expect(repo.create(newCandidate(orgA, { email: 'DUP@x.it' }))).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.create(newCandidate(orgB, { email: 'dup@x.it' }))).resolves.toBeDefined();
  });

  it('isolates organizations in every read and in save', async () => {
    const repo = createDrizzleCandidates(handle.db);
    const c = newCandidate(orgA, { email: 'iso@x.it' });
    await repo.create(c);
    expect(await repo.findById(orgB, c.id)).toBeNull();
    expect(await repo.findByEmail(orgB, 'iso@x.it')).toBeNull();
    expect(await repo.findByIds(orgB, [c.id])).toEqual([]);
    await expect(repo.save({ ...c, organizationId: orgB })).rejects.toThrow();
  });
});

describe('createDrizzleApplications', () => {
  it('creates, parses jsonb, saves, lists and finds the open one', async () => {
    const candidates = createDrizzleCandidates(handle.db);
    const repo = createDrizzleApplications(handle.db);
    const job = (await insertJob(orgA)).id;
    const c = await candidates.create(newCandidate(orgA));
    const first = newApplication(orgA, job, c.id, { createdAt: new Date('2026-02-01T00:00:00Z') });
    expect(await repo.create(first)).toEqual(first);
    expect(await repo.findOpen(orgA, job, c.id)).toEqual(first);
    const decided = { ...first, outcome: 'hired' as const, closedAt: new Date('2026-03-01T00:00:00Z') };
    expect(await repo.save(decided)).toEqual(decided);
    expect(await repo.findOpen(orgA, job, c.id)).toBeNull();
    const second = await repo.create(newApplication(orgA, job, c.id, { createdAt: new Date('2026-04-01T00:00:00Z') }));
    expect((await repo.listByJob(orgA, job)).map((a) => a.id)).toEqual([second.id, first.id]);
    expect((await repo.listByCandidate(orgA, c.id)).map((a) => a.id)).toEqual([second.id, first.id]);
  });

  it('refuses a second open application of the candidate to the job', async () => {
    const c = await createDrizzleCandidates(handle.db).create(newCandidate(orgA));
    const repo = createDrizzleApplications(handle.db);
    await repo.create(newApplication(orgA, jobA, c.id));
    await expect(repo.create(newApplication(orgA, jobA, c.id))).rejects.toBeInstanceOf(ConflictError);
  });

  it('isolates organizations', async () => {
    const c = await createDrizzleCandidates(handle.db).create(newCandidate(orgA));
    const repo = createDrizzleApplications(handle.db);
    const a = await repo.create(newApplication(orgA, jobA, c.id));
    expect(await repo.findById(orgB, a.id)).toBeNull();
    expect(await repo.findOpen(orgB, jobA, c.id)).toBeNull();
    expect(await repo.listByJob(orgB, jobA)).toEqual([]);
    expect(await repo.listByCandidate(orgB, c.id)).toEqual([]);
    await expect(repo.save({ ...a, organizationId: orgB })).rejects.toThrow();
  });
});

describe('notes, extractions and user directory', () => {
  it('stores notes, counts per application and isolates organizations', async () => {
    const c = await createDrizzleCandidates(handle.db).create(newCandidate(orgA));
    const a = await createDrizzleApplications(handle.db).create(newApplication(orgA, jobA, c.id));
    const repo = createDrizzleCandidateNotes(handle.db);
    await repo.create(buildNote({ id: randomUUID(), organizationId: orgA, candidateId: c.id, applicationId: a.id, createdAt: new Date('2026-01-01T00:00:00Z') }));
    const latest = await repo.create(buildNote({ id: randomUUID(), organizationId: orgA, candidateId: c.id, applicationId: null, createdAt: new Date('2026-02-01T00:00:00Z') }));
    expect((await repo.listByCandidate(orgA, c.id))[0]).toEqual(latest);
    expect(await repo.countByApplication(orgA, [a.id, 'none'])).toEqual({ [a.id]: 1, none: 0 });
    expect(await repo.countByApplication(orgB, [a.id])).toEqual({ [a.id]: 0 });
    expect(await repo.countByApplication(orgA, [])).toEqual({});
    expect(await repo.listByCandidate(orgB, c.id)).toEqual([]);
  });

  it('upserts extractions, validates jsonb and isolates organizations', async () => {
    const c = await createDrizzleCandidates(handle.db).create(newCandidate(orgA));
    const a = await createDrizzleApplications(handle.db).create(newApplication(orgA, jobA, c.id));
    const repo = createDrizzleCvExtractions(handle.db);
    const pending = buildExtraction({ applicationId: a.id, organizationId: orgA, status: 'pending', text: null, data: null, source: null });
    expect(await repo.upsert(pending)).toEqual(pending);
    const done = buildExtraction({ applicationId: a.id, organizationId: orgA });
    expect(await repo.upsert(done)).toEqual(done);
    expect(await repo.findByApplication(orgA, a.id)).toEqual(done);
    expect(await repo.findByApplications(orgA, [a.id])).toEqual([done]);
    expect(await repo.findByApplications(orgA, [])).toEqual([]);
    expect(await repo.findByApplication(orgB, a.id)).toBeNull();
    expect(await repo.findByApplications(orgB, [a.id])).toEqual([]);
    await expect(repo.upsert({ ...done, organizationId: orgB })).rejects.toThrow();
    await handle.pool.query(`update cv_extraction set data = '{"skills": 5}' where application_id = $1`, [a.id]);
    await expect(repo.findByApplication(orgA, a.id)).rejects.toThrow();
  });

  it('resolves names only for members of the organization', async () => {
    const userId = randomUUID();
    await handle.db.insert(schema.user).values({ id: userId, name: 'Rita', email: `${userId}@x.it` });
    await handle.db.insert(schema.member).values({ id: randomUUID(), organizationId: orgA, userId, role: 'recruiter', createdAt: new Date() });
    const dir = createDrizzleUserDirectory(handle.db);
    expect(await dir.namesOf(orgA, [userId, 'ghost'])).toEqual({ [userId]: 'Rita' });
    expect(await dir.namesOf(orgB, [userId])).toEqual({});
    expect(await dir.namesOf(orgA, [])).toEqual({});
  });

  it('finds organizations by id and by slug', async () => {
    const dir = createDrizzleOrganizationDirectory(handle.db);
    expect((await dir.findById(orgA))?.slug).toBe(slugA);
    expect(await dir.findById('nope')).toBeNull();
  });
});

describe('createDrizzleCandidateSearch', () => {
  let search: ReturnType<typeof createDrizzleCandidateSearch>;
  let org: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    org = (await insertOrg()).id;
    const job = (await insertJob(org)).id;
    const candidates = createDrizzleCandidates(handle.db);
    const apps = createDrizzleApplications(handle.db);
    const extractions = createDrizzleCvExtractions(handle.db);
    const seed = [
      ['ada', { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@analytical.org', tags: ['math', '100%'], talentPool: false }, 'Experienced in Kubernetes and Terraform', '2026-03-01'],
      ['grace', { firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil', tags: ['cobol'], talentPool: true }, 'Compiler pioneer, COBOL', '2026-02-01'],
      ['linus', { firstName: 'Linus', lastName: 'T', email: 'linus@kernel.org', tags: [], talentPool: true }, null, '2026-01-01'],
    ] as const;
    for (const [key, fields, text, date] of seed) {
      const c = await candidates.create(newCandidate(org, fields));
      ids[key] = c.id;
      const a = await apps.create(newApplication(org, job, c.id, { createdAt: new Date(date) }));
      if (text) await extractions.upsert(buildExtraction({ applicationId: a.id, organizationId: org, text }));
    }
    await candidates.create(newCandidate(org, { firstName: 'Nobody', lastName: 'Else', email: 'nobody@x.it' }));
    search = createDrizzleCandidateSearch(handle.db);
  });

  const find = async (query: object) => (await search.search({ organizationId: org, page: 1, limit: 25, ...query })).items.map((i) => i.candidate.id);

  it('lists most recently applied first, candidates without applications last, with counts', async () => {
    const { items, total } = await search.search({ organizationId: org, page: 1, limit: 25 });
    expect(total).toBe(4);
    expect(items.map((i) => i.candidate.id).slice(0, 3)).toEqual([ids.ada, ids.grace, ids.linus]);
    expect(items[0]).toMatchObject({ applicationCount: 1, lastAppliedAt: new Date('2026-03-01') });
    expect(items[3]).toMatchObject({ applicationCount: 0, lastAppliedAt: null });
  });

  it('searches by name, email, tag and CV text', async () => {
    expect(await find({ query: 'lovelace' })).toEqual([ids.ada]);
    expect(await find({ query: 'ADA LOVE' })).toEqual([ids.ada]);
    expect(await find({ query: 'navy.mil' })).toEqual([ids.grace]);
    expect(await find({ query: 'cobol' })).toEqual([ids.grace]);
    expect(await find({ query: 'kubernetes' })).toEqual([ids.ada]);
    expect(await find({ query: 'kubernetes terraform' })).toEqual([ids.ada]);
    expect(await find({ query: 'kubernetes cobol' })).toEqual([]);
    expect(await find({ query: 'zzzz' })).toEqual([]);
  });

  it('filters by exact tag and by talent pool', async () => {
    expect(await find({ tag: 'math' })).toEqual([ids.ada]);
    expect(await find({ tag: 'mat' })).toEqual([]);
    expect((await find({ talentPool: true })).toSorted()).toEqual([ids.grace, ids.linus].toSorted());
    expect(await find({ talentPool: true, query: 'compiler' })).toEqual([ids.grace]);
  });

  it('treats LIKE wildcards typed by the user as literals', async () => {
    expect(await find({ query: '100%' })).toEqual([ids.ada]);
    expect(await find({ query: '%' })).toEqual([ids.ada]);
    expect(await find({ query: '_' })).toEqual([]);
    expect(escapeLike('a%b_c\\')).toBe('a\\%b\\_c\\\\');
  });

  it('paginates with a stable total', async () => {
    const page = await search.search({ organizationId: org, page: 2, limit: 3 });
    expect(page.total).toBe(4);
    expect(page.items).toHaveLength(1);
  });

  it('never returns another organization, even with a matching CV text', async () => {
    const result = await search.search({ organizationId: orgB, query: 'kubernetes', page: 1, limit: 25 });
    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe('createDrizzleApplicationIntake with submitApplication', () => {
  const makeDeps = async (intakeWrapper?: (real: ReturnType<typeof createDrizzleApplicationIntake>) => ReturnType<typeof createDrizzleApplicationIntake>) => {
    const org = await insertOrg();
    const job = await insertJob(org.id);
    const privacy = createDrizzlePrivacyNotices(handle.db);
    await privacy.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org.id }));
    const real = createDrizzleApplicationIntake(handle.db);
    return {
      org,
      job,
      deps: {
        organizations: createDrizzleOrganizationDirectory(handle.db),
        jobs: createDrizzleJobs(handle.db),
        privacyNotices: privacy,
        intake: intakeWrapper ? intakeWrapper(real) : real,
        files: createInMemoryFileStorage(),
        queue: createInMemoryTaskQueue(),
        cvSniffer: fakeCvSniffer,
        newId: randomUUID,
        now: () => new Date('2026-06-01T10:00:00Z'),
      },
    };
  };
  const submission = (org: { slug: string }, job: { slug: string }) => ({
    organizationSlug: org.slug,
    jobSlug: job.slug,
    form: validApplicationForm(),
    cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' },
  });

  it('writes candidate, application, pending extraction and audit event in one transaction', async () => {
    const { org, job, deps } = await makeDeps();
    expect(await submitApplication(deps, submission(org, job))).toEqual({ received: true });
    const candidate = await createDrizzleCandidates(handle.db).findByEmail(org.id, 'ada@example.com');
    expect(candidate).toMatchObject({ firstName: 'Ada', talentPool: false });
    const [application] = await createDrizzleApplications(handle.db).listByCandidate(org.id, candidate?.id ?? '');
    expect(application).toMatchObject({ jobId: job.id, stageId: 'received', consent: { privacyNoticeVersion: 1, scopes: ['selection'] } });
    expect(await createDrizzleCvExtractions(handle.db).findByApplication(org.id, application?.id ?? '')).toMatchObject({ status: 'pending' });
    const { rows } = await handle.pool.query('select action, actor_id, metadata from audit_log where organization_id = $1', [org.id]);
    expect(rows).toEqual([{ action: 'application.received', actor_id: 'careers_page', metadata: { jobId: job.id, applicationId: application?.id } }]);
    expect(deps.files.keys()).toEqual([application?.cv.key]);
    expect(deps.queue.jobs()).toHaveLength(1);
  });

  it('refuses the same candidate applying twice to the same job, and keeps one application', async () => {
    const { org, job, deps } = await makeDeps();
    await submitApplication(deps, submission(org, job));
    await expect(submitApplication(deps, submission(org, job))).rejects.toThrow('already_applied');
    const { rows } = await handle.pool.query('select count(*)::int as n from application where organization_id = $1', [org.id]);
    expect(rows[0].n).toBe(1);
    expect(deps.files.keys()).toHaveLength(1);
  });

  it('rolls everything back in Postgres and deletes the stored CV when the transaction fails', async () => {
    const { org, job, deps } = await makeDeps((real) => ({
      run: (work) =>
        real.run(async (repositories) => {
          await work(repositories);
          throw new Error('boom after writes');
        }),
    }));
    await expect(submitApplication(deps, submission(org, job))).rejects.toThrow('boom after writes');
    for (const table of ['candidate', 'application', 'cv_extraction', 'audit_log']) {
      const { rows } = await handle.pool.query(`select count(*)::int as n from ${table} where organization_id = $1`, [org.id]);
      expect(rows[0].n, table).toBe(0);
    }
    expect(deps.files.keys()).toEqual([]);
    expect(deps.queue.jobs()).toEqual([]);
  });
});
