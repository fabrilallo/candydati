import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { migrationPackageKey, type MigrationBatch, type MigrationIssue } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { createFakeMigrationPackageReader, createInMemoryFileStorage, createInMemoryTaskQueue, fakeCvSniffer } from '../testing/index.js';
import { openedPackage, SAMPLE_FILES, SAMPLE_PACKAGE } from '../testing/migration-fixtures.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { analyzeMigration } from '../use-cases/migrations/analyze-migration.js';
import { createDrizzleMigrationBatches, createDrizzleMigrationIssues } from './drizzle-migrations.js';
import { createDrizzleUnitOfWork } from './drizzle-repositories.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00.000Z');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function insertOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
}

const batch = (organizationId: string, overrides: Partial<MigrationBatch> = {}): MigrationBatch => {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    organizationId,
    status: 'uploaded',
    sourceSystem: '',
    producer: '',
    connectorMaturity: 'package',
    createdBy: 'user_owner',
    counts: {},
    stageMapping: [],
    excludedJobs: [],
    declarations: null,
    packageKey: migrationPackageKey(organizationId, id),
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    committedAt: null,
    undoneAt: null,
    purgedAt: null,
    groupId: null,
    part: null,
    ...overrides,
  };
};

const issue = (organizationId: string, batchId: string, overrides: Partial<MigrationIssue>): MigrationIssue => ({
  id: randomUUID(),
  organizationId,
  batchId,
  level: 'info',
  code: 'merge_existing',
  ref: null,
  detail: null,
  ...overrides,
});

describe('createDrizzleMigrationBatches', () => {
  it('creates, finds per organization, lists newest first and changes status by compare-and-set', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    const repo = createDrizzleMigrationBatches(handle.db);
    const older = await repo.create(batch(a, { createdAt: new Date('2026-05-01T00:00:00.000Z') }));
    const newer = await repo.create(batch(a));
    expect(await repo.findById(a, newer.id)).toEqual(newer);
    expect(await repo.findById(b, newer.id)).toBeNull();
    expect((await repo.list(a)).map((x) => x.id)).toEqual([newer.id, older.id]);
    expect(await repo.list(b)).toEqual([]);
    const analyzing = await repo.transition(a, newer.id, 'uploaded', { status: 'analyzing', excludedJobs: ['j1'], counts: { jobs: 2 } });
    expect(analyzing).toMatchObject({ status: 'analyzing', excludedJobs: ['j1'], counts: { jobs: 2 } });
    await expect(repo.transition(a, newer.id, 'uploaded', { status: 'failed' })).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.transition(b, newer.id, 'analyzing', { status: 'failed' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('never returns the connector credentials', async () => {
    const org = await insertOrg();
    const repo = createDrizzleMigrationBatches(handle.db);
    const created = await repo.create(batch(org));
    await handle.pool.query(`update migration_batch set credentials_ciphertext = 'v1.secret' where id = $1`, [created.id]);
    const read = [await repo.findById(org, created.id), ...(await repo.list(org)), await repo.transition(org, created.id, 'uploaded', { status: 'analyzing' })];
    for (const row of read) expect(row).not.toHaveProperty('credentialsCiphertext');
  });
});

describe('createDrizzleMigrationBatches: connector credentials and parts', () => {
  it('stores sealed credentials apart, reads them back only on request and wipes them on demand', async () => {
    const org = await insertOrg();
    const other = await insertOrg();
    const repo = createDrizzleMigrationBatches(handle.db);
    const created = await repo.create(batch(org, { status: 'fetching', groupId: null, part: null }), { credentialsCiphertext: 'sb1.sealed' });
    expect(created).not.toHaveProperty('credentialsCiphertext');
    expect(await repo.readCredentials(org, created.id)).toBe('sb1.sealed');
    expect(await repo.readCredentials(other, created.id)).toBeNull();
    await repo.wipeCredentials(other, created.id);
    expect(await repo.readCredentials(org, created.id)).toBe('sb1.sealed');
    await repo.wipeCredentials(org, created.id);
    expect(await repo.readCredentials(org, created.id)).toBeNull();
    expect(await repo.readCredentials(org, 'missing')).toBeNull();
  });

  it('keeps the group and the part of a batch', async () => {
    const org = await insertOrg();
    const repo = createDrizzleMigrationBatches(handle.db);
    const lead = await repo.create(batch(org));
    const part = await repo.create(batch(org, { groupId: lead.id, part: 2 }));
    expect(await repo.findById(org, part.id)).toMatchObject({ groupId: lead.id, part: 2 });
    expect(await repo.transition(org, lead.id, 'uploaded', { groupId: lead.id, part: 1 })).toMatchObject({ groupId: lead.id, part: 1 });
  });
});

describe('createDrizzleMigrationBatches: ended batches', () => {
  const credentialsOf = async (id: string) => (await handle.pool.query<{ c: string | null }>('select credentials_ciphertext as c from migration_batch where id = $1', [id])).rows[0]?.c;

  it.each(['done', 'failed', 'undone'] as const)('wipes the connector credentials when the batch ends %s', async (status) => {
    const org = await insertOrg();
    const repo = createDrizzleMigrationBatches(handle.db);
    const created = await repo.create(batch(org, { status: 'importing' }));
    await handle.pool.query(`update migration_batch set credentials_ciphertext = 'v1.secret' where id = $1`, [created.id]);
    await repo.transition(org, created.id, 'importing', { status: 'analyzing' });
    expect(await credentialsOf(created.id)).toBe('v1.secret');
    await repo.transition(org, created.id, 'analyzing', { status });
    expect(await credentialsOf(created.id)).toBeNull();
  });

  it('locks a batch of its organization only, and lists ended batches not purged yet, oldest change first', async () => {
    const org = await insertOrg();
    const repo = createDrizzleMigrationBatches(handle.db);
    const old = new Date('2020-01-01T00:00:00Z');
    const done = await repo.create(batch(org, { status: 'done', updatedAt: new Date('2020-01-02T00:00:00Z') }));
    const undone = await repo.create(batch(org, { status: 'undone', updatedAt: old }));
    await repo.create(batch(org, { status: 'failed', updatedAt: old, purgedAt: old }));
    await repo.create(batch(org, { status: 'ready', updatedAt: old }));
    await repo.create(batch(org, { status: 'done', updatedAt: NOW }));
    const due = (await repo.listToPurge(new Date('2021-01-01T00:00:00Z'), 5000)).filter((b) => b.organizationId === org);
    expect(due.map((b) => b.id)).toEqual([undone.id, done.id]);
    expect((await repo.listToPurge(new Date('2021-01-01T00:00:00Z'), 1)).length).toBe(1);
    expect(await handle.db.transaction((tx) => createDrizzleMigrationBatches(tx).lock(org, done.id))).toEqual(done);
    expect(await repo.lock(await insertOrg(), done.id)).toBeNull();
  });
});

describe('createDrizzleMigrationIssues', () => {
  it('replaces, pages errors first, filters by level and stays inside its organization and batch', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    const batches = createDrizzleMigrationBatches(handle.db);
    const mine = await batches.create(batch(a));
    const theirs = await batches.create(batch(b));
    const repo = createDrizzleMigrationIssues(handle.db);
    await repo.replaceAll(a, mine.id, [issue(a, mine.id, { level: 'info', code: 'stage_unmapped', ref: 'j1/s2' })]);
    await repo.replaceAll(a, mine.id, [
      issue(a, mine.id, { level: 'info', code: 'merge_existing', ref: 'c1' }),
      issue(a, mine.id, { level: 'warning', code: 'consent_expired', ref: 'c2', detail: '2021-01-01T00:00:00.000Z' }),
      issue(a, mine.id, { level: 'error', code: 'privacy_notice_missing' }),
      // Filed under the call's batch and organization, whatever the row says.
      issue(b, theirs.id, { level: 'info', code: 'file_unreferenced', ref: 'files/x' }),
    ]);
    await repo.replaceAll(b, theirs.id, [issue(b, theirs.id, { code: 'merge_existing', ref: 'c9' })]);
    const page = await repo.list({ organizationId: a, batchId: mine.id, page: 1, limit: 3 });
    expect(page.total).toBe(4);
    expect(page.items.map((i) => [i.level, i.code])).toEqual([['error', 'privacy_notice_missing'], ['warning', 'consent_expired'], ['info', 'file_unreferenced']]);
    expect(page.items.every((i) => i.organizationId === a && i.batchId === mine.id)).toBe(true);
    expect((await repo.list({ organizationId: a, batchId: mine.id, page: 2, limit: 3 })).items.map((i) => i.ref)).toEqual(['c1']);
    expect((await repo.list({ organizationId: a, batchId: mine.id, page: 1, limit: 10, level: 'warning' })).items[0]?.detail).toBe('2021-01-01T00:00:00.000Z');
    expect((await repo.list({ organizationId: b, batchId: mine.id, page: 1, limit: 10 })).total).toBe(0);
    await repo.deleteByBatch(a, mine.id);
    expect((await repo.list({ organizationId: a, batchId: mine.id, page: 1, limit: 10 })).total).toBe(0);
    expect((await repo.list({ organizationId: b, batchId: theirs.id, page: 1, limit: 10 })).total).toBe(1);
  });
});

describe('analyzeMigration on Postgres', () => {
  it('stores the preview and its issues in one transaction and leaves the batch ready', async () => {
    const org = await insertOrg();
    const uow = createDrizzleUnitOfWork(handle.db);
    const r = uow.repositories;
    const packages = createFakeMigrationPackageReader();
    const created = await r.migrations.create(batch(org));
    packages.register(created.packageKey, openedPackage(SAMPLE_PACKAGE, SAMPLE_FILES()));
    let ids = 0;
    const deps = {
      transaction: uow.transaction,
      auditLog: r.auditLog,
      migrations: r.migrations,
      migrationIssues: r.migrationIssues,
      candidates: r.candidates,
      privacyNotices: r.privacyNotices,
      files: createInMemoryFileStorage(),
      queue: createInMemoryTaskQueue(),
      cvSniffer: fakeCvSniffer,
      packages,
      newId: () => `${created.id}-issue-${(ids += 1)}`,
      now: () => NOW,
    };
    expect(await analyzeMigration(deps, { organizationId: org, batchId: created.id })).toBe('ready');
    const ready = await r.migrations.findById(org, created.id);
    expect(ready).toMatchObject({ status: 'ready', sourceSystem: 'teamtailor', counts: { jobs: 2, consentGiven: 2, consentExpired: 0, issueErrors: 1 } });
    expect(ready?.stageMapping).toHaveLength(3);
    const { items } = await r.migrationIssues.list({ organizationId: org, batchId: created.id, page: 1, limit: 50 });
    // A fresh organization has no privacy notice: no retention to count from (nobody expires) and the commit will be refused.
    expect(items[0]?.code).toBe('privacy_notice_missing');
  });
});
