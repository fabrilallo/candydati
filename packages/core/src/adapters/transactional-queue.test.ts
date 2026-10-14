import { randomUUID } from 'node:crypto';
import { createDb, sql, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BindableTaskQueue, SqlExecutor } from '../intake-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { inSavepoint, inTransaction } from '../transaction.js';
import { createDrizzleUnitOfWork } from './drizzle-repositories.js';
import { toSqlExecutor } from './sql-executor.js';

/**
 * A stand-in for pg-boss with the same contract: `bindTo(executor)` inserts the task with the caller's executor, so it is
 * part of the caller's transaction. The real pg-boss queue is tested against Postgres in the api.
 */
const TABLE = 'test_task_queue';

let handle: DbHandle;

const sqlQueue = (executor: SqlExecutor): BindableTaskQueue => ({
  async enqueue(name, payload, options) {
    if (name === 'files.delete') await executor.executeSql('select 1/0');
    await executor.executeSql(`insert into ${TABLE} (name, data, singleton_key) values ($1, $2::jsonb, $3)`, [name, JSON.stringify(payload), options?.singletonKey ?? null]);
  },
  bindTo: (bound) => sqlQueue(bound),
});

const tasksFor = async (marker: string): Promise<readonly string[]> => {
  const result = await handle.db.execute<{ name: string }>(sql`select name from test_task_queue where data ->> 'organizationId' = ${marker} order by id`);
  return result.rows.map((row) => row.name);
};

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 4);
  await handle.db.execute(sql.raw(`create table if not exists ${TABLE} (id serial primary key, name text not null, data jsonb not null, singleton_key text)`));
});
afterAll(async () => {
  await handle.close();
});

describe('toSqlExecutor', () => {
  it('runs pg-style $n text with its values, a placeholder used twice included', async () => {
    const executor = toSqlExecutor(handle.db);
    const { rows } = await executor.executeSql('select $1::int + $2::int as sum, $1::int as again, $$a$$ as dollar', [2, 3]);
    expect(rows).toEqual([{ sum: 5, again: 2, dollar: 'a' }]);
  });

  it('runs text without placeholders', async () => {
    const { rows } = await toSqlExecutor(handle.db).executeSql('select 1 as one');
    expect(rows).toEqual([{ one: 1 }]);
  });
});

describe('a task queue bound to the transaction (#3)', () => {
  it('a task exists if and only if its transaction committed: a crash after the enqueue leaves no task', async () => {
    const queue = sqlQueue(toSqlExecutor(handle.db));
    const uow = createDrizzleUnitOfWork(handle.db, undefined, queue);
    const committed = randomUUID();
    await inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
      await tx.queue.enqueue('email.send', { organizationId: committed, messageId: 'm' });
      // Not visible outside the transaction before the commit: the worker cannot pick it up early.
      expect(await tasksFor(committed)).toEqual([]);
    });
    expect(await tasksFor(committed)).toEqual(['email.send']);

    const crashed = randomUUID();
    await expect(
      inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
        await tx.queue.enqueue('email.send', { organizationId: crashed, messageId: 'm' });
        throw new Error('process died before the commit');
      }),
    ).rejects.toThrow('process died');
    expect(await tasksFor(crashed)).toEqual([]);
  });

  it('a savepoint whose statement fails on Postgres drops only its own task, and the transaction commits the others', async () => {
    const queue = sqlQueue(toSqlExecutor(handle.db));
    const uow = createDrizzleUnitOfWork(handle.db, undefined, queue);
    const org = randomUUID();
    await inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
      await inSavepoint(tx, async (sp) => sp.queue.enqueue('automation.run', { organizationId: org, applicationId: 'a', stageId: 's' }));
      await expect(
        inSavepoint(tx, async (sp) => {
          await sp.queue.enqueue('cv.extract', { organizationId: org, applicationId: 'b' });
          // `files.delete` makes the stand-in run a failing statement on the transaction's connection.
          await sp.queue.enqueue('files.delete', { organizationId: org, key: 'k' });
        }),
      ).rejects.toThrow();
      await tx.queue.enqueue('email.send', { organizationId: org, messageId: 'm' });
    });
    expect(await tasksFor(org)).toEqual(['automation.run', 'email.send']);
  });

  it('defers a queue it does not own to after the commit, as before', async () => {
    const sent: string[] = [];
    const uow = createDrizzleUnitOfWork(handle.db);
    const queue = { enqueue: async (name: string) => void sent.push(name) };
    await inTransaction({ transaction: uow.transaction, queue }, async (tx) => {
      await tx.queue.enqueue('email.send', { organizationId: 'o', messageId: 'm' });
      expect(sent).toEqual([]);
    });
    expect(sent).toEqual(['email.send']);
  });
});
