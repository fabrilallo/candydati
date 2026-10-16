import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import {
  application,
  applicationStageEvent,
  candidate,
  candidateNote,
  job,
  message,
  migrationBatch,
  migrationIssue,
  organization,
} from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;
const cv = { cvKey: 'k', cvFileName: 'cv.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1 };
/** Drizzle wraps the driver error: the constraint name is on its cause. */
const violates = (constraint: string) => ({ cause: expect.objectContaining({ constraint }) });
const noCv = { cvKey: null, cvFileName: null, cvMediaType: null, cvSizeBytes: null };

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly batchId: string;
}

const insertBatch = async (org: string): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(migrationBatch).values({ id, organizationId: org, status: 'uploaded', sourceSystem: 'teamtailor', producer: 'connector:teamtailor@1', connectorMaturity: 'beta', createdBy: 'u', packageKey: `organizations/${org}/migrations/${id}/package.zip` });
  return id;
};

async function insertWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db.insert(candidate).values({ id: candidateId, organizationId: org, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: NOW });
  return { org, jobId, candidateId, batchId: await insertBatch(org) };
}

const insertApplication = async (world: World, values: Partial<typeof application.$inferInsert> = {}): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(application).values({ id, organizationId: world.org, jobId: world.jobId, candidateId: world.candidateId, stageId: 'received', ...cv, consent, retentionExpiresAt: NOW, source: 'import', outcome: 'not_selected', ...values });
  return id;
};

const insertNote = (world: World, values: Partial<typeof candidateNote.$inferInsert>) =>
  handle.db.insert(candidateNote).values({ id: randomUUID(), organizationId: world.org, candidateId: world.candidateId, body: 'b', ...values });

describe('migration tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('stores a batch with empty defaults and no credentials', async () => {
    const world = await insertWorld();
    const [row] = await handle.db.select().from(migrationBatch).where(eq(migrationBatch.id, world.batchId));
    expect(row).toMatchObject({ status: 'uploaded', counts: {}, stageMapping: [], excludedJobs: [], declarations: null, credentialsCiphertext: null, error: null, committedAt: null, undoneAt: null });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('refuses an unknown status, level or maturity', async () => {
    const world = await insertWorld();
    await expect(handle.db.update(migrationBatch).set({ status: 'nope' as never }).where(eq(migrationBatch.id, world.batchId))).rejects.toThrow();
    await expect(handle.db.update(migrationBatch).set({ connectorMaturity: 'alpha' as never }).where(eq(migrationBatch.id, world.batchId))).rejects.toThrow();
    await expect(handle.db.insert(migrationIssue).values({ id: randomUUID(), organizationId: world.org, batchId: world.batchId, level: 'fatal' as never, code: 'x' })).rejects.toThrow();
  });

  it('stores issues of a batch and refuses an unknown batch', async () => {
    const world = await insertWorld();
    await handle.db.insert(migrationIssue).values({ id: randomUUID(), organizationId: world.org, batchId: world.batchId, level: 'warning', code: 'consent_expired', ref: 'c1', detail: 'retention expired' });
    const rows = await handle.db.select().from(migrationIssue).where(eq(migrationIssue.batchId, world.batchId));
    expect(rows).toEqual([expect.objectContaining({ level: 'warning', code: 'consent_expired', ref: 'c1' })]);
    await expect(handle.db.insert(migrationIssue).values({ id: randomUUID(), organizationId: world.org, batchId: 'no-such-batch', level: 'info', code: 'x' })).rejects.toThrow();
  });

  it('links migrated rows to their batch and keeps the batch while they exist', async () => {
    const world = await insertWorld();
    const { batchId } = world;
    await handle.db.update(job).set({ migrationBatchId: batchId, origin: 'migration' }).where(eq(job.id, world.jobId));
    await handle.db.update(candidate).set({ migrationBatchId: batchId }).where(eq(candidate.id, world.candidateId));
    const applicationId = await insertApplication(world, { migrationBatchId: batchId });
    await insertNote(world, { authorName: 'Giulia', migrationBatchId: batchId });
    await handle.db.insert(message).values({ id: randomUUID(), organizationId: world.org, applicationId, candidateId: world.candidateId, direction: 'outbound', subject: 's', bodyText: 'b', status: 'sent', historical: true, migrationBatchId: batchId });
    await handle.db.insert(applicationStageEvent).values({ id: randomUUID(), organizationId: world.org, applicationId, jobId: world.jobId, toStageId: 'received', occurredAt: NOW, actorType: 'system', backfilled: true, migrationBatchId: batchId });
    await expect(handle.db.delete(migrationBatch).where(eq(migrationBatch.id, batchId))).rejects.toThrow();
    await expect(handle.db.update(candidate).set({ migrationBatchId: 'no-such-batch' }).where(eq(candidate.id, world.candidateId))).rejects.toThrow();
  });

  it('gives jobs the app origin by default and refuses an unknown origin', async () => {
    const world = await insertWorld();
    const [row] = await handle.db.select().from(job).where(eq(job.id, world.jobId));
    expect(row).toMatchObject({ origin: 'app', migrationBatchId: null });
    await expect(handle.db.update(job).set({ origin: 'nope' as never }).where(eq(job.id, world.jobId))).rejects.toThrow();
  });
});

describe('applications without a CV', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('accepts a migrated application without a CV', async () => {
    const world = await insertWorld();
    const id = await insertApplication(world, { ...noCv, migrationBatchId: world.batchId });
    const [row] = await handle.db.select().from(application).where(eq(application.id, id));
    expect(row).toMatchObject({ cvKey: null, cvFileName: null, migrationBatchId: world.batchId });
  });

  it('refuses an application without a CV that does not come from a migration', async () => {
    const world = await insertWorld();
    await expect(insertApplication(world, noCv)).rejects.toMatchObject(violates('application_cv_check'));
  });

  it('refuses a half-stored CV', async () => {
    const world = await insertWorld();
    await expect(insertApplication(world, { ...cv, cvSizeBytes: null, migrationBatchId: world.batchId })).rejects.toMatchObject(violates('application_cv_check'));
  });
});

describe('notes by external authors', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('stores a note by a member or by a named external author', async () => {
    const world = await insertWorld();
    await insertNote(world, { authorId: 'u' });
    await insertNote(world, { authorName: 'Giulia Rossi' });
    const rows = await handle.db.select().from(candidateNote).where(eq(candidateNote.candidateId, world.candidateId));
    expect(rows.map((row) => [row.authorId, row.authorName]).sort()).toEqual([[null, 'Giulia Rossi'], ['u', null]]);
  });

  it('refuses a note with no author at all', async () => {
    const world = await insertWorld();
    await expect(insertNote(world, {})).rejects.toMatchObject(violates('candidate_note_author_check'));
    await expect(insertNote(world, { authorName: '  ' })).rejects.toMatchObject(violates('candidate_note_author_check'));
  });
});

describe('historical messages', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('are not historical by default', async () => {
    const world = await insertWorld();
    const applicationId = await insertApplication(world);
    const id = randomUUID();
    await handle.db.insert(message).values({ id, organizationId: world.org, applicationId, candidateId: world.candidateId, direction: 'inbound', subject: 's', bodyText: 'b', status: 'received' });
    const [row] = await handle.db.select().from(message).where(eq(message.id, id));
    expect(row).toMatchObject({ historical: false, migrationBatchId: null });
  });

  it('can never be waiting to be sent', async () => {
    const world = await insertWorld();
    const applicationId = await insertApplication(world);
    const values = { organizationId: world.org, applicationId, candidateId: world.candidateId, direction: 'outbound' as const, subject: 's', bodyText: 'b', historical: true };
    for (const status of ['queued', 'sending'] as const) {
      await expect(handle.db.insert(message).values({ id: randomUUID(), ...values, status })).rejects.toMatchObject(violates('message_historical_check'));
    }
  });

  it('leave the outbound cap index to live messages', async () => {
    const { rows } = await handle.pool.query<{ indexdef: string }>(`select indexdef from pg_indexes where indexname = 'message_org_candidate_outbound_idx'`);
    expect(rows[0]?.indexdef).toMatch(/direction = 'outbound'.*historical = false/);
  });
});
