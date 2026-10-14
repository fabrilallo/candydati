import { randomUUID } from 'node:crypto';
import { createDrizzleUnitOfWork, inTransaction } from '@tt/core';
import { createDb, sql, type DbHandle } from '@tt/db';
import { createPgBossQueue } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiTestDatabaseUrl } from './testing/test-database.js';

/** The real pg-boss on the test database: a task sent inside a unit of work commits or rolls back with it (#3). */
const SCHEMA = 'pgboss_tx_test';
let boss: PgBoss;
let handle: DbHandle;

const jobsFor = async (organizationId: string): Promise<number> => {
  const { rows } = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(SCHEMA)}.job where data ->> 'organizationId' = ${organizationId}`);
  return rows[0]?.n ?? 0;
};

beforeAll(async () => {
  boss = new PgBoss({ connectionString: apiTestDatabaseUrl(), schema: SCHEMA, schedule: false, supervise: false });
  await boss.start();
  handle = createDb(apiTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await boss.stop({ graceful: false });
  await handle.close();
});

describe('pg-boss inside the unit of work', () => {
  it('a job exists if and only if the transaction that queued it committed', async () => {
    const queue = createPgBossQueue(boss);
    const uow = createDrizzleUnitOfWork(handle.db, undefined, queue);
    const committed = randomUUID();
    await inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
      await tx.queue.enqueue('email.send', { organizationId: committed, messageId: 'm1' }, { singletonKey: `m-${committed}` });
      expect(await jobsFor(committed)).toBe(0);
    });
    expect(await jobsFor(committed)).toBe(1);

    const crashed = randomUUID();
    await expect(
      inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
        await tx.queue.enqueue('email.send', { organizationId: crashed, messageId: 'm2' });
        throw new Error('crash before the commit');
      }),
    ).rejects.toThrow('crash before the commit');
    expect(await jobsFor(crashed)).toBe(0);
  });
});
