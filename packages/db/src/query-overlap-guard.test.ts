import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, installQueryOverlapGuard, type DbHandle, type QueryOverlapGuard } from './index.js';
import { testDatabaseUrl } from './testing/test-database.js';

describe('installQueryOverlapGuard', () => {
  let guard: QueryOverlapGuard;
  let handle: DbHandle;

  beforeEach(() => {
    guard = installQueryOverlapGuard();
    handle = createDb(testDatabaseUrl(), 2);
  });
  afterEach(async () => {
    guard.uninstall();
    await handle.close();
  });

  it('flags two queries started together on one transaction connection', async () => {
    await handle.db.transaction(async (tx) => {
      await Promise.all([tx.execute('select 1 as a'), tx.execute('select 2 as b')]);
    });
    expect(guard.overlaps()).toHaveLength(1);
    expect(guard.overlaps()[0]?.sql).toContain('select 2 as b');
  });

  it('is quiet for queries awaited one after the other, and for parallel queries on a pool', async () => {
    await handle.db.transaction(async (tx) => {
      await tx.execute('select 1');
      await tx.execute('select 2');
    });
    await Promise.all([handle.db.execute('select 3'), handle.db.execute('select 4')]);
    expect(guard.overlaps()).toEqual([]);
  });

  it('forgets what it saw on reset and stops patching on uninstall', async () => {
    await handle.db.transaction(async (tx) => {
      await Promise.all([tx.execute('select 1'), tx.execute('select 2')]);
    });
    guard.reset();
    expect(guard.overlaps()).toEqual([]);
    guard.uninstall();
    await handle.db.transaction(async (tx) => {
      await Promise.all([tx.execute('select 1'), tx.execute('select 2')]);
    });
    expect(guard.overlaps()).toEqual([]);
  });
});
