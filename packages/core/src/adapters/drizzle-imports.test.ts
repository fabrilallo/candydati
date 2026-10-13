import { createHash, randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { importFileKey, type ParsedImportCvInput } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImportCommitDeps, ImportUndoDeps, ConsentDeps } from '../import-ports.js';
import type { RetentionDeps } from '../privacy-ports.js';
import {
  buildApplication,
  buildCandidate,
  buildJob,
  buildPrivacyNotice,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  fakePdfBytes,
  testMessagingConfig,
  userActor,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { recordImportAnalysis, startImportAnalysis } from '../use-cases/imports/analyze.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { answerConsentRequest } from '../use-cases/imports/consent-request.js';
import { createImportBatch } from '../use-cases/imports/create-import-batch.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { undoImport } from '../use-cases/imports/undo-import.js';
import { getCandidate } from '../use-cases/candidates/get-candidate.js';
import { searchCandidates } from '../use-cases/candidates/search-candidates.js';
import { runRetention } from '../use-cases/privacy/run-retention.js';
import { NotFoundError } from '../errors.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidateSearch } from './drizzle-candidate-search.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleConversations } from './drizzle-conversations.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleErasure } from './drizzle-erasure.js';
import { createDrizzleImportCommit } from './drizzle-import-commit.js';
import { createDrizzleConsentTokens, createDrizzleImportAnalyses, createDrizzleImportBatches, createDrizzleImportItems } from './drizzle-imports.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMemberDirectory } from './drizzle-members.js';
import { createDrizzleMessages } from './drizzle-messages.js';
import { createDrizzleNotifications } from './drizzle-notifications.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleDataExports, createDrizzleRetentionRuns } from './drizzle-privacy.js';

let handle: DbHandle;
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-06-01T10:00:00Z');
const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly otherJobId: string;
  readonly files: ReturnType<typeof createInMemoryFileStorage>;
  readonly queue: ReturnType<typeof createInMemoryTaskQueue>;
  readonly deps: ImportCommitDeps & ImportUndoDeps & ConsentDeps & RetentionDeps;
  readonly now: { current: Date };
}

async function buildWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobs = createDrizzleJobs(handle.db);
  const jobId = randomUUID();
  const otherJobId = randomUUID();
  for (const id of [jobId, otherJobId]) await jobs.create(buildJob({ id, slug: id, organizationId: org, status: 'published', publishedAt: NOW }));
  await createDrizzlePrivacyNotices(handle.db).create(buildPrivacyNotice({ id: randomUUID(), organizationId: org, version: 1 }));
  const files = createInMemoryFileStorage();
  const queue = createInMemoryTaskQueue();
  const now = { current: NOW };
  const db = handle.db;
  const deps = {
    auditLog: createDrizzleAuditLog(db),
    jobs,
    candidates: createDrizzleCandidates(db),
    applications: createDrizzleApplications(db),
    imports: createDrizzleImportBatches(db),
    importItems: createDrizzleImportItems(db),
    importAnalyses: createDrizzleImportAnalyses(db),
    consentTokens: createDrizzleConsentTokens(db),
    commit: createDrizzleImportCommit(db),
    organizations: createDrizzleOrganizationDirectory(db),
    privacyNotices: createDrizzlePrivacyNotices(db),
    erasure: createDrizzleErasure(db),
    mail: { conversations: createDrizzleConversations(db), messages: createDrizzleMessages(db), config: testMessagingConfig, newToken: () => randomUUID().replaceAll('-', '') },
    notifications: createDrizzleNotifications(db),
    members: createDrizzleMemberDirectory(db),
    retentionRuns: createDrizzleRetentionRuns(db),
    dataExports: createDrizzleDataExports(db),
    cvSniffer: fakeCvSniffer,
    files,
    queue,
    newId: () => randomUUID(),
    newSecret: () => `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`,
    hash,
    now: () => now.current,
  } as unknown as World['deps'];
  return { org, jobId, otherJobId, files, queue, deps, now };
}

const recruiterOf = (org: string) => userActor({ id: 'user_rec', organizationId: org, role: 'recruiter' });

interface Person {
  readonly first: string;
  readonly last: string;
  readonly email: string;
}
const newPerson = (): Person => {
  const unique = randomUUID().slice(0, 8);
  return { first: `Zelda${unique}`, last: `Quuxington${unique}`, email: `zelda.${unique}@example.org` };
};

/** Creates, analyses and returns a ready batch for these people (CV + row each), playing the worker. */
async function readyBatch(world: World, people: readonly Person[], jobId = world.jobId): Promise<string> {
  const { deps, org } = world;
  const batch = await createImportBatch(deps, recruiterOf(org), { jobId, stageId: 'received', files: [{ fileName: 'import.zip', bytes: fakePdfBytes() }] });
  await startImportAnalysis(deps, { organizationId: org, batchId: batch.id });
  const cvs: ParsedImportCvInput[] = [];
  for (const person of people) {
    const key = importFileKey(org, batch.id, `cv/${person.last}.pdf`);
    await world.files.put(key, fakePdfBytes(), 'application/pdf');
    cvs.push({ fileName: `${person.last}.pdf`, key, text: `CV of ${person.first} ${person.last}`, extraction: null, name: `${person.first} ${person.last}`, email: person.email });
  }
  const rows = people.map((p, index) => ({ index: index + 2, cells: { Nome: p.first, Cognome: p.last, Email: p.email, Note: `Note on ${p.first}`, Telefono: '+39 347 0001112' } }));
  await recordImportAnalysis(deps, { organizationId: org, batchId: batch.id, headers: ['Nome', 'Cognome', 'Email', 'Note', 'Telefono'], cvs, rows });
  return batch.id;
}

async function runCommit(world: World, batchId: string): Promise<void> {
  await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
  await commitImport(world.deps, { organizationId: world.org, batchId });
}

/** Every table of the schema except `audit_log`: how many rows mention any of the needles anywhere in the row. */
async function leftovers(needles: readonly string[]): Promise<Record<string, number>> {
  const { rows: tables } = await handle.pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'audit_log'`,
  );
  const found: Record<string, number> = {};
  for (const { table_name } of tables) {
    const { rows } = await handle.pool.query<{ n: number }>(`select count(*)::int as n from "${table_name}" t where t::text ilike any($1::text[])`, [needles.map((n) => `%${n}%`)]);
    if ((rows[0]?.n ?? 0) > 0) found[table_name] = rows[0]?.n ?? 0;
  }
  return found;
}

const secretOf = async (applicationId: string): Promise<string> => {
  const { rows } = await handle.pool.query<{ body_text: string }>(`select body_text from message where application_id = $1`, [applicationId]);
  return /\/consent\/(\S+)/.exec(rows[0]?.body_text ?? '')?.[1] ?? '';
};
const applicationOf = async (org: string, email: string) => {
  const person = await createDrizzleCandidates(handle.db).findByEmail(org, email);
  const [application] = person ? await createDrizzleApplications(handle.db).listByCandidate(org, person.id) : [];
  return { person, application };
};

describe('import on Postgres', () => {
  it('runs the lifecycle: create, analyse, preview, commit, reconfirm one, undo skips them and leaves nothing of the rest', async () => {
    const world = await buildWorld();
    const [mario, giulia] = [newPerson(), newPerson()] as [Person, Person];
    const batchId = await readyBatch(world, [mario, giulia]);
    expect(await leftovers([mario.email])).toMatchObject({ import_item: 1, import_analysis: 1 });
    await runCommit(world, batchId);

    const [batch] = await createDrizzleImportBatches(handle.db).list(world.org);
    expect(batch).toMatchObject({ id: batchId, status: 'done', counts: { imported: 2, emailsQueued: 2 }, sourceFiles: [] });
    const m = await applicationOf(world.org, mario.email);
    expect(m.application).toMatchObject({ consentStatus: 'to_renew', source: 'import', importBatchId: batchId, stageId: 'received' });
    expect(m.application?.retentionExpiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(m.person).toMatchObject({ importBatchId: batchId, talentPool: false });
    // Working data and uploaded originals are gone as soon as the batch is done.
    expect(Object.keys(await leftovers([mario.email]))).not.toContain('import_item');
    expect(Object.keys(await leftovers([mario.email]))).not.toContain('import_analysis');
    expect(world.files.keys().filter((k) => k.includes('/imports/'))).toEqual([]);

    // Giulia reconfirms: from now on her data is hers.
    const g = await applicationOf(world.org, giulia.email);
    expect(await answerConsentRequest(world.deps, { token: await secretOf(g.application!.id), scopes: ['selection'] })).toEqual({ status: 'reconfirmed' });
    expect((await applicationOf(world.org, giulia.email)).application).toMatchObject({ consentStatus: 'given' });

    const result = await undoImport(world.deps, recruiterOf(world.org), { batchId });
    expect(result).toMatchObject({ erased: 1, skippedReconfirmed: 1, failed: 0, batch: { status: 'undone' } });
    const needles = [mario.email, mario.first, mario.last, m.person!.id, m.application!.id];
    // Only the candidate.erased webhook event (ids and counts) may remain outside the audit log.
    expect(await leftovers(needles)).toEqual({ outbox_event: 1 });
    expect((await applicationOf(world.org, giulia.email)).person).not.toBeNull();
    const { rows: audit } = await handle.pool.query<{ action: string; metadata: unknown }>(`select action, metadata from audit_log where organization_id = $1 and action in ('candidate.erased', 'import.undone', 'import.committed') order by occurred_at`, [world.org]);
    expect(audit.map((a) => a.action)).toEqual(['import.committed', 'candidate.erased', 'import.undone']);
    expect(audit[1]?.metadata).toEqual({ reason: 'import_undone', applicationCount: 1 });
    const { rows: pii } = await handle.pool.query(`select 1 from audit_log a where a::text ilike any($1::text[])`, [[mario.email, mario.first, mario.last].map((v) => `%${v}%`)]);
    expect(pii).toEqual([]);
  });

  it('undo removes nothing at all of an untouched batch: candidates, applications, notes, extractions, tokens, messages, files', async () => {
    const world = await buildWorld();
    const people = [newPerson(), newPerson(), newPerson()];
    const batchId = await readyBatch(world, people);
    await runCommit(world, batchId);
    const needles = people.flatMap((p) => [p.email, p.first, p.last]);
    expect(Object.keys(await leftovers(needles))).toEqual(expect.arrayContaining(['candidate', 'application', 'candidate_note', 'cv_extraction', 'message']));
    expect(world.files.keys().filter((k) => k.includes('/applications/'))).toHaveLength(3);
    const result = await undoImport(world.deps, recruiterOf(world.org), { batchId });
    expect(result).toMatchObject({ erased: 3, skippedReconfirmed: 0, failed: 0 });
    expect(await leftovers(needles)).toEqual({});
    expect(world.files.keys()).toEqual([]);
    const { rows: left } = await handle.pool.query<{ n: number }>(`select (select count(*) from consent_token where organization_id = $1)::int + (select count(*) from conversation where organization_id = $1)::int + (select count(*) from application where organization_id = $1)::int as n`, [world.org]);
    expect(left[0]?.n).toBe(0);
  });

  it('on an existing candidate undo removes only the application, note and file the batch added', async () => {
    const world = await buildWorld();
    const person = newPerson();
    const existing = buildCandidate({ id: randomUUID(), organizationId: world.org, email: person.email, firstName: person.first, lastName: person.last });
    await createDrizzleCandidates(handle.db).create(existing);
    const earlier = buildApplication({ id: randomUUID(), organizationId: world.org, jobId: world.otherJobId, candidateId: existing.id, cv: { key: `organizations/${world.org}/applications/earlier/cv`, fileName: 'old.pdf', mediaType: 'application/pdf', sizeBytes: 64 } });
    await createDrizzleApplications(handle.db).create(earlier);
    await createDrizzleCandidateNotes(handle.db).create({ id: randomUUID(), organizationId: world.org, candidateId: existing.id, applicationId: earlier.id, authorId: 'u', body: 'earlier note', createdAt: NOW });
    await createDrizzleCvExtractions(handle.db).upsert({ applicationId: earlier.id, organizationId: world.org, status: 'done', text: 't', data: null, source: 'text', updatedAt: NOW });
    await world.files.put(earlier.cv.key, fakePdfBytes(), 'application/pdf');

    const batchId = await readyBatch(world, [person]);
    await runCommit(world, batchId);
    expect(await createDrizzleApplications(handle.db).listByCandidate(world.org, existing.id)).toHaveLength(2);
    await undoImport(world.deps, recruiterOf(world.org), { batchId });
    const left = await createDrizzleApplications(handle.db).listByCandidate(world.org, existing.id);
    expect(left.map((a) => a.id)).toEqual([earlier.id]);
    expect(await createDrizzleCandidates(handle.db).findById(world.org, existing.id)).toMatchObject({ email: person.email, importBatchId: null });
    expect((await createDrizzleCandidateNotes(handle.db).listByCandidate(world.org, existing.id)).map((n) => n.body)).toEqual(['earlier note']);
    expect(world.files.keys()).toEqual([earlier.cv.key]);
    expect((await leftovers([`Note on ${person.first}`])).candidate_note).toBeUndefined();
  });

  it('declining erases at once; the expiry job erases the unanswered with reason consent_not_renewed and never warns', async () => {
    const world = await buildWorld();
    const [declining, silent, keeper] = [newPerson(), newPerson(), newPerson()] as [Person, Person, Person];
    const batchId = await readyBatch(world, [declining, silent, keeper]);
    await runCommit(world, batchId);
    const d = await applicationOf(world.org, declining.email);
    expect(await answerConsentRequest(world.deps, { token: await secretOf(d.application!.id), decline: true })).toEqual({ status: 'declined' });
    expect(await leftovers([declining.email, declining.last])).toEqual({});
    const k = await applicationOf(world.org, keeper.email);
    await answerConsentRequest(world.deps, { token: await secretOf(k.application!.id), scopes: ['selection', 'talent_pool'] });

    world.now.current = new Date(NOW.getTime() + 20 * DAY);
    const early = await runRetention(world.deps, { now: world.now.current });
    expect(early.digests).toEqual([]);
    expect((await applicationOf(world.org, silent.email)).application).toBeDefined();
    world.now.current = new Date(NOW.getTime() + 31 * DAY);
    const result = await runRetention(world.deps, { now: world.now.current });
    expect(result.failures).toEqual([]);
    expect((await applicationOf(world.org, silent.email)).person).toBeNull();
    expect((await applicationOf(world.org, keeper.email)).application).toMatchObject({ consentStatus: 'given' });
    expect(await leftovers([silent.email, silent.last])).toEqual({});
    const { rows } = await handle.pool.query<{ reason: string }>(`select metadata ->> 'reason' as reason from audit_log where organization_id = $1 and action = 'candidate.erased' order by occurred_at`, [world.org]);
    expect(rows.map((r) => r.reason)).toEqual(['consent_declined', 'consent_not_renewed']);
  });

  it('applies the visibility rules in SQL: search, talent pool, profile, until the candidate reconfirms', async () => {
    const world = await buildWorld();
    const person = newPerson();
    const visible = buildCandidate({ id: randomUUID(), organizationId: world.org, email: `visible.${randomUUID().slice(0, 6)}@x.it`, firstName: 'Visible', lastName: 'Person' });
    await createDrizzleCandidates(handle.db).create(visible);
    await createDrizzleApplications(handle.db).create(buildApplication({ id: randomUUID(), organizationId: world.org, jobId: world.otherJobId, candidateId: visible.id, cv: { key: 'k', fileName: 'c.pdf', mediaType: 'application/pdf', sizeBytes: 1 } }));
    const batchId = await readyBatch(world, [person]);
    await runCommit(world, batchId);
    const search = createDrizzleCandidateSearch(handle.db);
    const actor = recruiterOf(world.org);
    const searchDeps = { auditLog: createDrizzleAuditLog(handle.db), candidateSearch: search } as never;
    expect((await search.search({ organizationId: world.org, page: 1, limit: 10 })).items.map((i) => i.candidate.id)).toEqual([visible.id]);
    expect((await search.search({ organizationId: world.org, query: person.last, page: 1, limit: 10 })).total).toBe(0);
    expect((await searchCandidates(searchDeps, actor, { query: person.first })).total).toBe(0);
    const { person: imported, application } = await applicationOf(world.org, person.email);
    const profileDeps = { auditLog: createDrizzleAuditLog(handle.db), candidates: createDrizzleCandidates(handle.db), applications: createDrizzleApplications(handle.db), extractions: createDrizzleCvExtractions(handle.db), messages: createDrizzleMessages(handle.db), jobs: createDrizzleJobs(handle.db), notes: createDrizzleCandidateNotes(handle.db), users: { namesOf: async () => ({}) }, now: () => NOW } as never;
    await expect(getCandidate(profileDeps, actor, { candidateId: imported!.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCandidate(profileDeps, actor, { candidateId: imported!.id, viaJobId: world.otherJobId })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getCandidate(profileDeps, actor, { candidateId: imported!.id, viaJobId: world.jobId })).applications).toHaveLength(1);

    await answerConsentRequest(world.deps, { token: await secretOf(application!.id), scopes: ['selection', 'talent_pool'] });
    expect((await search.search({ organizationId: world.org, query: person.last, page: 1, limit: 10 })).total).toBe(1);
    expect((await search.search({ organizationId: world.org, talentPool: true, page: 1, limit: 10 })).items.map((i) => i.candidate.id)).toEqual([imported!.id]);
  });

  it('keeps organizations apart: tokens, batches and lookups never cross', async () => {
    const world = await buildWorld();
    const other = await buildWorld();
    const person = newPerson();
    const batchId = await readyBatch(world, [person]);
    expect(await createDrizzleImportBatches(handle.db).findById(other.org, batchId)).toBeNull();
    expect(await createDrizzleImportBatches(handle.db).list(other.org)).toEqual([]);
    expect(await createDrizzleImportItems(handle.db).listAll(other.org, batchId)).toEqual([]);
    expect(await createDrizzleImportAnalyses(handle.db).find(other.org, batchId)).toBeNull();
    await expect(undoImport(other.deps, recruiterOf(other.org), { batchId })).rejects.toBeInstanceOf(NotFoundError);
    await runCommit(world, batchId);
    const mine = await applicationOf(world.org, person.email);
    expect((await applicationOf(other.org, person.email)).person).toBeNull();
    const tokens = createDrizzleConsentTokens(handle.db);
    const secret = await secretOf(mine.application!.id);
    expect(await tokens.findByHash(hash(secret))).toMatchObject({ organizationId: world.org, usedAt: null });
    expect(await tokens.markUsed(hash(secret), NOW)).toBe(true);
    expect(await tokens.markUsed(hash(secret), NOW)).toBe(false);
    expect(await tokens.findByHash('nope')).toBeNull();
  });

  it('pages, filters and updates items in the repository', async () => {
    const world = await buildWorld();
    const people = [newPerson(), newPerson(), newPerson()];
    const batchId = await readyBatch(world, people);
    const items = createDrizzleImportItems(handle.db);
    const first = await items.list({ organizationId: world.org, batchId, page: 1, limit: 2 });
    expect(first).toMatchObject({ total: 3 });
    expect(first.items.map((i) => i.position)).toEqual([0, 1]);
    expect((await items.list({ organizationId: world.org, batchId, page: 2, limit: 2 })).items).toHaveLength(1);
    expect((await items.list({ organizationId: world.org, batchId, page: 1, limit: 5, confidence: 'low' })).total).toBe(0);
    const [a, b] = first.items as [typeof first.items[number], typeof first.items[number]];
    await items.setIncluded(world.org, batchId, [{ itemId: a.id, included: false }, { itemId: b.id, included: true }]);
    expect((await items.listAll(world.org, batchId)).map((i) => i.included)).toEqual([false, true, true]);
    await items.setStatus(world.org, a.id, 'failed', 'boom');
    expect((await items.listAll(world.org, batchId))[0]).toMatchObject({ status: 'failed', error: 'boom' });
    await items.deleteByBatch(world.org, batchId);
    expect(await items.listAll(world.org, batchId)).toEqual([]);
    const analyses = createDrizzleImportAnalyses(handle.db);
    expect((await analyses.find(world.org, batchId))?.cvs).toHaveLength(3);
    await analyses.save({ batchId, organizationId: world.org, cvs: [], rows: [] });
    expect((await analyses.find(world.org, batchId))?.cvs).toEqual([]);
  });

  it('a chunk is one transaction: a failing write leaves nothing of the chunk', async () => {
    const world = await buildWorld();
    const people = [newPerson(), newPerson()];
    const batchId = await readyBatch(world, people);
    await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
    let calls = 0;
    const failing = { ...world.deps, newSecret: () => { calls += 1; if (calls === 2) throw new Error('rng down'); return `secret-${calls}-${randomUUID()}`; } };
    const done = await commitImport(failing, { organizationId: world.org, batchId });
    expect(done).toMatchObject({ status: 'failed', counts: { imported: 0, failed: 2 } });
    expect(Object.keys(await leftovers(people.map((p) => p.email)))).toEqual([]);
    expect(world.files.keys().filter((k) => k.includes('/applications/'))).toEqual([]);
  });
});
