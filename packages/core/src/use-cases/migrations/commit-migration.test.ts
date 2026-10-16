import { IMPORT_RECONFIRM_DAYS, DAY_MS, RECEIVED_STAGE_ID } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ORG_A, seedMigrationCommitWorld, type TestMigrationCommitDeps } from '../../testing/index.js';
import { COMMIT_FILES, COMMIT_PACKAGE, confirmedMigration, DECLARATIONS } from '../../testing/migration-commit-fixtures.js';
import { openedPackage } from '../../testing/migration-fixtures.js';
import { commitMigration } from './commit-migration.js';

const run = (deps: TestMigrationCommitDeps, batchId: string, lastAttempt = false) => commitMigration(deps, { organizationId: ORG_A, batchId, lastAttempt });
const inOrg = <T extends { organizationId: string }>(rows: readonly T[]) => rows.filter((row) => row.organizationId === ORG_A);

async function committed() {
  const deps = seedMigrationCommitWorld();
  const batch = await confirmedMigration(deps);
  expect(await run(deps, batch.id)).toBe('done');
  const jobs = deps.jobs.snapshot().filter((job) => job.id !== 'job_1');
  const people = deps.store.read().candidates.filter((c) => c.id !== 'cand_1');
  const applications = deps.store.read().applications.filter((a) => a.migrationBatchId === batch.id);
  return { deps, batch, jobs, people, applications };
}

describe('commitMigration: what it writes', () => {
  it('creates the included jobs in their final status, with the merged pipeline, and leaves the excluded job out', async () => {
    const { jobs } = await committed();
    const backend = jobs.find((job) => job.content.title === 'Backend Developer');
    expect(jobs.map((job) => [job.content.title, job.status])).toEqual([
      ['Backend Developer', 'closed'],
      ['Designer', 'draft'],
    ]);
    expect(backend).toMatchObject({ closedAt: new Date('2025-06-01T09:00:00Z'), createdAt: new Date('2025-01-10T09:00:00Z'), createdBy: 'user_owner', content: { summary: 'APIs' } });
    expect(backend?.content.process.map((stage) => [stage.type, stage.title])).toEqual([
      ['screening_call', 'Phone screen'],
      ['offer', 'Offer'],
    ]);
  });

  it('merges people by email without touching the existing profile, and creates the others', async () => {
    const { deps, people } = await committed();
    expect(deps.store.read().candidates.find((c) => c.id === 'cand_1')).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', phone: null });
    expect(people.map((c) => [c.firstName, c.email.endsWith('@example.com') ? c.email : 'placeholder'])).toEqual([
      ['Carla', 'carla@example.com'],
      ['Dario', 'placeholder'],
    ]);
    expect(people[0]).toMatchObject({ tags: ['design'], createdAt: new Date('2025-01-20T09:00:00Z'), talentPool: false });
  });

  it('writes applications with stage, outcome, original dates, origin and the consent carried over', async () => {
    const { deps, applications, jobs } = await committed();
    const backend = jobs.find((job) => job.content.title === 'Backend Developer');
    const ada = applications.find((a) => a.candidateId === 'cand_1');
    expect(ada).toMatchObject({
      jobId: backend?.id,
      stageId: backend?.content.process[1]?.id,
      outcome: 'hired',
      closedAt: new Date('2025-04-01T09:00:00Z'),
      createdAt: new Date('2025-02-01T09:00:00Z'),
      stageChangedAt: new Date('2025-03-01T09:00:00Z'),
      source: 'import',
      origin: 'linkedin',
      consentStatus: 'given',
      consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 1, scopes: ['selection', 'talent_pool'], origin: 'migration', sourceSystem: 'teamtailor' },
    });
    const carla = applications.filter((a) => a.consentStatus === 'to_renew');
    expect(carla).toHaveLength(2);
    // Planned against the moment the owner confirmed (the fixed clock of the test world).
    expect(carla[0]?.retentionExpiresAt).toEqual(new Date(deps.now().getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS));
    expect(applications.find((a) => a.outcome === 'withdrawn')?.stageId).toBe(RECEIVED_STAGE_ID);
    expect(applications.find((a) => a.outcome === null)?.message).toBe('Vorrei lavorare con voi.');
  });

  it('copies readable CVs to the application key, queues their extraction, and skips other files', async () => {
    const { deps, applications, batch } = await committed();
    const ada = applications.find((a) => a.candidateId === 'cand_1');
    expect(ada?.cv).toEqual({ key: `organizations/${ORG_A}/applications/${ada?.id}/cv`, fileName: 'ada-cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 });
    expect(deps.files.keys()).toContain(ada?.cv?.key);
    expect(applications.filter((a) => a.cv !== null)).toHaveLength(1);
    expect(deps.store.read().extractions.find((e) => e.applicationId === ada?.id)).toMatchObject({ status: 'pending' });
    expect(deps.queue.jobs()).toContainEqual({ name: 'cv.extract', payload: { organizationId: ORG_A, applicationId: ada?.id } });
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.commit).toMatchObject({ cvs: 1, filesSkipped: 2 });
  });

  it('records the stage history as backfilled system events, moves inside a merged stage left out', async () => {
    const { deps, applications, jobs } = await committed();
    const backend = jobs.find((job) => job.content.title === 'Backend Developer');
    const ada = applications.find((a) => a.candidateId === 'cand_1');
    const [screen, offer] = backend?.content.process.map((stage) => stage.id) ?? [];
    const events = deps.store.read().stageEvents.filter((e) => e.applicationId === ada?.id);
    expect(events.map((e) => [e.fromStageId, e.toStageId, e.outcome, e.occurredAt.toISOString(), e.actorType, e.backfilled])).toEqual([
      [null, RECEIVED_STAGE_ID, null, '2025-02-01T09:00:00.000Z', 'system', true],
      [RECEIVED_STAGE_ID, screen, null, '2025-02-10T09:00:00.000Z', 'system', true],
      [screen, offer, null, '2025-03-01T09:00:00.000Z', 'system', true],
      [offer, null, 'hired', '2025-04-01T09:00:00.000Z', 'system', true],
    ]);
  });

  it('signs notes by the member with the author email, else by the outside name; past emails are historical', async () => {
    const { deps, applications } = await committed();
    const notes = inOrg(deps.store.read().notes).map((n) => [n.body, n.authorId, n.authorName]);
    expect(notes).toEqual([
      ['Ottimo colloquio', 'user_test', null],
      ['Portfolio interessante', null, 'Giulia Rossi'],
      ['Non disponibile', null, 'Ex recruiter'],
      ['Already known to us', null, 'Giulia Rossi'],
    ]);
    const historical = inOrg(deps.messagingStore.read().messages).filter((m) => m.historical);
    expect(historical.map((m) => [m.direction, m.status, m.subject, m.sentAt?.toISOString()])).toEqual([
      ['outbound', 'sent', 'Offerta', '2025-03-05T09:00:00.000Z'],
      ['inbound', 'received', '', '2026-02-03T09:00:00.000Z'],
    ]);
    expect(historical.every((m) => applications.some((a) => a.id === m.applicationId))).toBe(true);
    expect(deps.queue.jobs().filter((job) => job.name === 'email.send' && historical.some((m) => m.id === job.payload.messageId))).toEqual([]);
  });

  it('asks only the people with no consent date and an address to reconfirm, once each, about their latest application', async () => {
    const { deps, applications } = await committed();
    const tokens = deps.importStore.read().tokens;
    const latest = applications.find((a) => a.consentStatus === 'to_renew' && a.outcome === null);
    expect(tokens.map((t) => t.applicationId)).toEqual([latest?.id]);
    const requests = inOrg(deps.messagingStore.read().messages).filter((m) => !m.historical);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: 'queued', applicationId: latest?.id, sentBy: 'system' });
    expect(deps.queue.jobs()).toContainEqual({ name: 'email.send', payload: { organizationId: ORG_A, messageId: requests[0]?.id } });
  });

  it('tags every written row with the batch, ends done and records migration.committed with counts, source and declarations', async () => {
    const { deps, batch, jobs, people } = await committed();
    const tags = deps.migrationStore.read().tags.filter((t) => t.batchId === batch.id);
    expect(tags.filter((t) => t.kind === 'job').map((t) => t.id).toSorted()).toEqual(jobs.map((j) => j.id).toSorted());
    expect(tags.filter((t) => t.kind === 'candidate').map((t) => t.id).toSorted()).toEqual(people.map((c) => c.id).toSorted());
    expect(tags.filter((t) => t.kind === 'stage_event')).toHaveLength(10);
    const done = await deps.migrations.findById(ORG_A, batch.id);
    expect(done).toMatchObject({ status: 'done', error: null, committedAt: deps.now() });
    const counts = { jobs: 2, candidatesCreated: 2, candidatesMerged: 1, applications: 4, skippedAlreadyApplied: 0, stageEvents: 10, notes: 4, messages: 2, reconfirmationsQueued: 1 };
    expect(done?.counts.commit).toMatchObject(counts);
    const audit = deps.auditLog.events().find((e) => e.action === 'migration.committed');
    expect(audit).toMatchObject({
      actor: { type: 'system', id: null },
      target: { type: 'migration_batch', id: batch.id },
      metadata: { status: 'done', sourceSystem: 'teamtailor', producer: 'connector:teamtailor@1', connectorMaturity: 'package', declarations: { userId: 'user_owner', ...DECLARATIONS }, counts },
    });
  });

  it('skips a batch that is not importing, or missing', async () => {
    const { deps, batch } = await committed();
    expect(await run(deps, batch.id)).toBe('skipped');
    expect(await run(deps, 'nope')).toBe('skipped');
  });
});

describe('commitMigration: failures', () => {
  it('fails at once, with the reader code, a package that can no longer be read', async () => {
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps);
    deps.packages.register(batch.packageKey, { ok: false, code: 'invalid_archive', details: [] });
    expect(await run(deps, batch.id)).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'invalid_archive' });
    expect(deps.auditLog.events().find((e) => e.action === 'migration.committed')?.metadata).toMatchObject({ status: 'failed', error: 'invalid_archive' });
  });

  it('fails without a privacy notice, and with a job content that is not a valid job', async () => {
    const noNotice = seedMigrationCommitWorld();
    const first = await confirmedMigration(noNotice);
    const withoutNotice = { ...noNotice, privacyNotices: { async findActive() { return null; }, async create<T>(n: T) { return n; }, async list() { return []; } } };
    expect(await run(withoutNotice, first.id)).toBe('failed');
    expect((await noNotice.migrations.findById(ORG_A, first.id))?.error).toBe('privacy_notice_missing');
    const deps = seedMigrationCommitWorld();
    const second = await confirmedMigration(deps);
    const opened = openedPackage(COMMIT_PACKAGE, COMMIT_FILES());
    if (!opened.ok) throw new Error('unexpected');
    // Past the package schema (a reader bug, a newer schema): the job schema still refuses it before anything is written.
    const invalid = { ...opened.package, manifest: { ...opened.package.manifest, jobs: opened.package.manifest.jobs.map((job) => ({ ...job, content: { responseDays: 0 } })) } };
    deps.packages.register(second.packageKey, { ok: true, package: invalid });
    expect(await run(deps, second.id)).toBe('failed');
    expect((await deps.migrations.findById(ORG_A, second.id))?.error).toBe('job_content_invalid');
    expect(deps.jobs.snapshot().map((j) => j.id)).toEqual(['job_1']);
  });

  it('lets the queue retry an unexpected error, and fails the batch on the last attempt', async () => {
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps);
    const broken = { ...deps, migratedRows: { ...deps.migratedRows, insertNotes: async () => Promise.reject(new Error('db down')) } };
    await expect(run(broken, batch.id)).rejects.toThrow('db down');
    expect((await deps.migrations.findById(ORG_A, batch.id))?.status).toBe('importing');
    expect(await run(broken, batch.id, true)).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'commit_failed' });
  });
});
