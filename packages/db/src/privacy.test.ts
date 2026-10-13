import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { dataExport, organization, retentionRun } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

describe('privacy tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('stores retention runs with counts defaulting to zero', async () => {
    const org = await insertOrg();
    await handle.db.insert(retentionRun).values({ id: randomUUID(), organizationId: org, startedAt: NOW });
    const [row] = await handle.db.select().from(retentionRun).where(eq(retentionRun.organizationId, org));
    expect(row).toMatchObject({ warned: 0, erased: 0, startedAt: NOW });
  });

  it('stores data exports pending, with a nullable size and completion', async () => {
    const org = await insertOrg();
    await handle.db.insert(dataExport).values({ id: randomUUID(), organizationId: org, requestedBy: 'u', expiresAt: NOW });
    const [row] = await handle.db.select().from(dataExport).where(eq(dataExport.organizationId, org));
    expect(row).toMatchObject({ status: 'pending', sizeBytes: null, completedAt: null });
  });

  it('keeps big sizes and refuses rows for unknown organizations', async () => {
    const org = await insertOrg();
    const id = randomUUID();
    await handle.db.insert(dataExport).values({ id, organizationId: org, requestedBy: 'u', expiresAt: NOW, sizeBytes: 5_000_000_000 });
    const [row] = await handle.db.select().from(dataExport).where(eq(dataExport.id, id));
    expect(row?.sizeBytes).toBe(5_000_000_000);
    await expect(handle.db.insert(retentionRun).values({ id: randomUUID(), organizationId: 'nope', startedAt: NOW })).rejects.toThrow();
  });
});
