import { describe, expect, it } from 'vitest';
import type { TaskQueue } from './intake-ports.js';
import { cell, createInMemoryTransaction } from './testing/in-memory-transaction.js';
import { createInMemoryTaskQueue } from './testing/index.js';
import { inSavepoint, inTransaction, queuesInTransaction, type TransactionPort } from './transaction.js';

describe('inSavepoint (in memory)', () => {
  it('undoes only the writes of a failing savepoint and keeps the rest of the transaction', async () => {
    const transaction = createInMemoryTransaction();
    const kept = cell('start');
    const undone = cell('start');
    await inTransaction({ transaction }, async (tx) => {
      kept.set('outer');
      await expect(
        inSavepoint(tx, async () => {
          undone.set('inner');
          throw new Error('rule failed');
        }),
      ).rejects.toThrow('rule failed');
      await inSavepoint(tx, async () => kept.set('second savepoint'));
    });
    expect([kept.get(), undone.get()]).toEqual(['second savepoint', 'start']);
  });

  it('rolls a committed savepoint back with its transaction', async () => {
    const transaction = createInMemoryTransaction();
    const value = cell(0);
    await expect(
      inTransaction({ transaction }, async (tx) => {
        await inSavepoint(tx, async () => value.set(1));
        throw new Error('outer');
      }),
    ).rejects.toThrow('outer');
    expect(value.get()).toBe(0);
  });

  it('drops the tasks and effects of a failing savepoint and runs the others after the commit', async () => {
    const queue = createInMemoryTaskQueue();
    const effects: string[] = [];
    await inTransaction({ transaction: createInMemoryTransaction(), queue }, async (tx) => {
      await inSavepoint(tx, async (sp) => {
        await sp.queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'kept' });
        sp.afterCommit?.(async () => void effects.push('kept'));
      });
      await inSavepoint(tx, async (sp) => {
        await sp.queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'dropped' });
        sp.afterCommit?.(async () => void effects.push('dropped'));
        throw new Error('boom');
      }).catch(() => undefined);
      expect(queue.jobs()).toEqual([]);
    });
    expect(queue.jobs()).toEqual([{ name: 'cv.extract', payload: { organizationId: 'o', applicationId: 'kept' } }]);
    expect(effects).toEqual(['kept']);
  });

  it('a failed savepoint and then a failed transaction put back the value from before the transaction', async () => {
    const transaction = createInMemoryTransaction();
    const value = cell('before');
    await expect(
      inTransaction({ transaction }, async (tx) => {
        await inSavepoint(tx, async () => {
          value.set('savepoint');
          throw new Error('inner');
        }).catch(() => undefined);
        throw new Error('outer');
      }),
    ).rejects.toThrow('outer');
    expect(value.get()).toBe('before');
  });

  it('opens a transaction of its own outside one', async () => {
    const transaction = createInMemoryTransaction();
    const value = cell(0);
    await expect(
      inSavepoint({ transaction }, async () => {
        value.set(1);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(value.get()).toBe(0);
  });

  it('nests: an inner failure keeps the outer savepoint', async () => {
    const transaction = createInMemoryTransaction();
    const outer = cell(0);
    const inner = cell(0);
    await inTransaction({ transaction }, async (tx) =>
      inSavepoint(tx, async (sp) => {
        outer.set(1);
        await inSavepoint(sp, async () => {
          inner.set(1);
          throw new Error('inner');
        }).catch(() => undefined);
      }),
    );
    expect([outer.get(), inner.get()]).toEqual([1, 0]);
  });
});

describe('a queue the transaction owns', () => {
  it('is used as it is inside the transaction instead of being deferred to after the commit', async () => {
    const sent: string[] = [];
    const root: TaskQueue = { enqueue: async () => void sent.push('root') };
    const bound: TaskQueue = { enqueue: async () => void sent.push('in transaction') };
    const transaction: TransactionPort = { run: (work) => work(new Map([[root, bound]])) };
    await inTransaction({ transaction, queue: root }, async (tx) => {
      await tx.queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'a' });
      expect(sent).toEqual(['in transaction']);
      expect(queuesInTransaction(tx)).toBe(true);
    });
    expect(queuesInTransaction({ transaction, queue: root })).toBe(false);
    await inTransaction({ transaction: createInMemoryTransaction(), queue: root }, async (tx) => expect(queuesInTransaction(tx)).toBe(false));
    expect(sent).toEqual(['in transaction']);
  });

  it('runs a savepoint without isolation when the port offers none (a fake), still joining the transaction', async () => {
    const order: string[] = [];
    const transaction: TransactionPort = {
      run: async (work) => {
        order.push('begin');
        const result = await work(new Map());
        order.push('commit');
        return result;
      },
    };
    await inTransaction({ transaction }, async (tx) => inSavepoint(tx, async () => void order.push('work')));
    expect(order).toEqual(['begin', 'work', 'commit']);
  });
});
