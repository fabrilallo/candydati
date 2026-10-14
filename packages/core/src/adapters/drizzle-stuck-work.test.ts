import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryTaskQueue } from '../testing/index.js';
import { buildImportWorld, newPerson, readyBatch, recruiterOf } from '../testing/import-postgres.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { reconcileQueuedWork } from '../use-cases/reconcile/reconcile-queued-work.js';
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
    await reconcileQueuedWork({ stuck, queue }, { now: LATER, limit: 5000 });
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
});
