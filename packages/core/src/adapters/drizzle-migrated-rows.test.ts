import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildJob } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMigratedRows } from './drizzle-migrated-rows.js';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const batchId = randomUUID();
  await handle.db.insert(schema.migrationBatch).values({ id: batchId, organizationId: org, status: 'done', sourceSystem: 's', producer: 'p', connectorMaturity: 'package', createdBy: 'u', packageKey: 'k' });
  const rows = createDrizzleMigratedRows(handle.db);
  const job = async (status: 'draft' | 'closed' | 'published') => {
    const value = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status });
    await rows.insertJob(batchId, value);
    return value.id;
  };
  return { org, batchId, rows, job };
}

describe('migrated rows: deleting the jobs of an undone migration', () => {
  it('deletes a migrated job nothing refers to, never a published one nor one of another batch or organization', async () => {
    const { org, batchId, rows, job } = await world();
    const [draft, published, other] = [await job('draft'), await job('published'), await job('closed')];
    expect(await rows.jobIdsOf(org, batchId)).toEqual([draft, published, other].toSorted());
    expect(await rows.deleteJobIfUnused(org, randomUUID(), other)).toBe(false);
    expect(await rows.deleteJobIfUnused(randomUUID(), batchId, other)).toBe(false);
    expect(await rows.deleteJobIfUnused(org, batchId, published)).toBe(false);
    expect(await rows.deleteJobIfUnused(org, batchId, draft)).toBe(true);
    expect(await createDrizzleJobs(handle.db).findById(org, draft)).toBeNull();
    const [stored] = await handle.db.select({ origin: schema.job.origin }).from(schema.job).where(eq(schema.job.id, other));
    expect(stored?.origin).toBe('migration');
  });

  it('keeps a job still referenced elsewhere, inside a transaction that goes on', async () => {
    const { org, batchId, job } = await world();
    const closed = await job('closed');
    await handle.db.insert(schema.jobTeamMember).values({ organizationId: org, jobId: closed, userId: 'u1', role: 'recruiter', addedBy: 'u1' });
    const outcome = await handle.db.transaction(async (tx) => {
      const deleted = await createDrizzleMigratedRows(tx).deleteJobIfUnused(org, batchId, closed);
      return { deleted, stillUsable: await createDrizzleJobs(tx).findById(org, closed) };
    });
    expect(outcome.deleted).toBe(false);
    expect(outcome.stillUsable?.id).toBe(closed);
  });
});
