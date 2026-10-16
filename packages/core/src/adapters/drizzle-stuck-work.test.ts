import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, createInMemoryFileStorage, createInMemoryTaskQueue } from '../testing/index.js';
import { buildImportWorld, newPerson, readyBatch, recruiterOf } from '../testing/import-postgres.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { reconcileQueuedWork } from '../use-cases/reconcile/reconcile-queued-work.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleStuckWork } from './drizzle-stuck-work.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00Z');
const LATER = new Date(NOW.getTime() + 60 * 60_000);

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

/** An application of the world's first job with a CV extraction in `status`, last touched at NOW. */
async function insertApplicationRow(org: string, jobId: string, status: 'pending' | 'done'): Promise<string> {
  const candidateId = randomUUID();
  await createDrizzleCandidates(handle.db).create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@x.example` }));
  const id = randomUUID();
  await createDrizzleApplications(handle.db).create(buildApplication({ id, organizationId: org, jobId, candidateId }));
  await createDrizzleCvExtractions(handle.db).upsert({ applicationId: id, organizationId: org, status, text: null, data: null, source: null, updatedAt: NOW });
  return id;
}

describe('reconciler on Postgres (#3)', () => {
  it('finds a reconfirmation whose delivery was never queued (crash after the commit) and queues it', async () => {
    const world = await buildImportWorld(handle, NOW);
    const batchId = await readyBatch(world, [newPerson()]);
    await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
    // The process dies after the chunk committed and before the delivery task was sent.
    await commitImport({ ...world.deps, queue: createInMemoryTaskQueue(new Error('process died')) }, { organizationId: world.org, batchId });
    const [stored] = await handle.db.select().from(schema.message).where(eq(schema.message.organizationId, world.org));
    expect(stored?.status).toBe('queued');
    const queue = createInMemoryTaskQueue();
    const stuck = createDrizzleStuckWork(handle.db);
    expect(await stuck.queuedMessages(NOW, 1000)).not.toContainEqual({ organizationId: world.org, id: stored!.id });
    await reconcileQueuedWork({ stuck, queue, files: createInMemoryFileStorage() }, { now: LATER, limit: 5000 });
    expect(queue.jobs()).toContainEqual({ name: 'email.send', payload: { organizationId: world.org, messageId: stored!.id } });
  });

  it('finds exports still pending and import batches waiting for their task, never the finished ones', async () => {
    const world = await buildImportWorld(handle, NOW);
    const exportId = randomUUID();
    await handle.db.insert(schema.dataExport).values({ id: exportId, organizationId: world.org, requestedBy: 'u', status: 'pending', createdAt: NOW, expiresAt: LATER });
    await handle.db.insert(schema.dataExport).values({ id: randomUUID(), organizationId: world.org, requestedBy: 'u', status: 'ready', createdAt: NOW, expiresAt: LATER });
    const stuck = createDrizzleStuckWork(handle.db);
    const pending = await stuck.pendingExports(LATER, 5000);
    expect(pending).toContainEqual({ organizationId: world.org, id: exportId });
    expect(pending.filter((row) => row.organizationId === world.org)).toHaveLength(1);
    const batches = await stuck.unfinishedImports(new Date(Date.now() + 60_000), 5000);
    expect(batches.every((row) => row.status === 'uploaded' || row.status === 'importing')).toBe(true);
  });

  it('finds a CV extraction left pending since before the cutoff, never a finished one', async () => {
    const world = await buildImportWorld(handle, NOW);
    const pendingApplication = await insertApplicationRow(world.org, world.jobId, 'pending');
    await insertApplicationRow(world.org, world.jobId, 'done');
    const stuck = createDrizzleStuckWork(handle.db);
    const found = (await stuck.pendingExtractions(LATER, 5000)).filter((row) => row.organizationId === world.org);
    expect(found).toEqual([{ organizationId: world.org, id: pendingApplication }]);
    expect((await stuck.pendingExtractions(new Date(NOW.getTime() - 60_000), 5000)).filter((row) => row.organizationId === world.org)).toEqual([]);
  });

  it('finds migration batches waiting for their analysis or commit since before the cutoff, by last change', async () => {
    const world = await buildImportWorld(handle, NOW);
    const insert = async (status: string, updatedAt: Date): Promise<string> => {
      const id = randomUUID();
      await handle.db.insert(schema.migrationBatch).values({ id, organizationId: world.org, status: status as never, sourceSystem: '', producer: '', connectorMaturity: 'package', createdBy: 'u', packageKey: 'k', createdAt: NOW, updatedAt });
      return id;
    };
    const uploaded = await insert('uploaded', NOW);
    const analyzing = await insert('analyzing', NOW);
    const importing = await insert('importing', NOW);
    await insert('importing', LATER);
    await insert('ready', NOW);
    await insert('done', NOW);
    const found = (await createDrizzleStuckWork(handle.db).unfinishedMigrations(new Date(NOW.getTime() + 60_000), 5000)).filter((row) => row.organizationId === world.org);
    expect(found.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { organizationId: world.org, id: uploaded, status: 'uploaded' },
        { organizationId: world.org, id: analyzing, status: 'analyzing' },
        { organizationId: world.org, id: importing, status: 'importing' },
      ].toSorted((a, b) => a.id.localeCompare(b.id)),
    );
  });
  it('fails connector fetches that stopped moving, wiping their credentials, and leaves live ones alone', async () => {
    const world = await buildImportWorld(handle, NOW);
    const insert = async (status: string, updatedAt: Date): Promise<string> => {
      const id = randomUUID();
      await handle.db.insert(schema.migrationBatch).values({ id, organizationId: world.org, status: status as never, sourceSystem: 'fake-ats', producer: '', connectorMaturity: 'beta', createdBy: 'u', packageKey: 'k', createdAt: NOW, updatedAt, credentialsCiphertext: 'sb1.sealed' });
      return id;
    };
    const stalled = await insert('fetching', NOW);
    const live = await insert('fetching', LATER);
    const analyzing = await insert('analyzing', NOW);
    const failed = await createDrizzleStuckWork(handle.db).failStalledFetches(new Date(NOW.getTime() + 60_000), 5000);
    expect(failed.map((row) => row.id)).toContain(stalled);
    expect(failed.find((row) => row.id === stalled)?.organizationId).toBe(world.org);
    expect(failed.map((row) => row.id)).not.toContain(live);
    const rows = await handle.db.select().from(schema.migrationBatch).where(eq(schema.migrationBatch.organizationId, world.org));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(stalled)).toMatchObject({ status: 'failed', error: 'fetch_interrupted', credentialsCiphertext: null });
    expect(byId.get(live)).toMatchObject({ status: 'fetching', credentialsCiphertext: 'sb1.sealed' });
    expect(byId.get(analyzing)).toMatchObject({ status: 'analyzing', credentialsCiphertext: 'sb1.sealed' });
  });
});
