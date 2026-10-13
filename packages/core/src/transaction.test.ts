import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AuditWriteError } from './errors.js';
import type { TaskQueue } from './intake-ports.js';
import { afterCommitOrNow, baseDeps, inTransaction, type TransactionPort } from './transaction.js';
import { defineUseCase } from './use-case.js';
import { cell, createInMemoryTransaction } from './testing/in-memory-transaction.js';
import { createInMemoryAuditLog, createInMemoryTaskQueue, failingAuditLog, userActor } from './testing/index.js';

/** A port that hands out its own "transaction-bound" repositories, like the Drizzle one does. */
const recordingPort = (repositories: ReadonlyMap<unknown, unknown> = new Map(), onEffectError?: (error: unknown) => void) => {
  const runs: string[] = [];
  const port: TransactionPort = {
    onEffectError,
    async run(work) {
      runs.push('begin');
      try {
        const result = await work(repositories);
        runs.push('commit');
        return result;
      } catch (error) {
        runs.push('rollback');
        throw error;
      }
    },
  };
  return { port, runs };
};

describe('inTransaction', () => {
  it('rebinds by identity the repositories the transaction owns, top level and one object deep, and keeps the rest', async () => {
    const outside = { name: 'outside' };
    const inside = { name: 'inside' };
    const injected = { name: 'a fake a test passed' };
    const { port } = recordingPort(new Map([[outside, inside]]));
    const deps = { transaction: port, applications: outside, rules: outside, erasure: injected, other: 1, feedback: { applications: outside, sender: 'x' } };
    const seen = await inTransaction(deps, async (tx) => tx);
    expect(seen.applications).toBe(inside);
    expect(seen.rules).toBe(inside);
    expect(seen.erasure).toBe(injected);
    expect(seen.feedback).toEqual({ applications: inside, sender: 'x' });
    expect(seen.other).toBe(1);
    expect(baseDeps(seen)).toBe(deps);
    expect(deps.applications).toBe(outside);
  });

  it('sends queued tasks only after the commit, and never after a rollback', async () => {
    const queue = createInMemoryTaskQueue();
    const { port, runs } = recordingPort();
    const deps = { transaction: port, queue };
    await inTransaction(deps, async (tx) => {
      await tx.queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'a' });
      expect(queue.jobs()).toEqual([]);
      runs.push('work');
    });
    expect(runs).toEqual(['begin', 'work', 'commit']);
    expect(queue.jobs()).toEqual([{ name: 'cv.extract', payload: { organizationId: 'o', applicationId: 'a' } }]);
    await expect(
      inTransaction(deps, async (tx) => {
        await tx.queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'b' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(queue.jobs()).toHaveLength(1);
  });

  it('reports a failing effect without failing the committed work, and still runs the next ones', async () => {
    const errors: unknown[] = [];
    const { port } = recordingPort(new Map(), (error) => errors.push(error));
    const ran: string[] = [];
    const result = await inTransaction({ transaction: port }, async (tx) => {
      tx.afterCommit?.(async () => {
        throw new Error('queue down');
      });
      tx.afterCommit?.(async () => {
        ran.push('second');
      });
      return 'done';
    });
    expect(result).toBe('done');
    expect(errors).toEqual([new Error('queue down')]);
    expect(ran).toEqual(['second']);
  });

  it('joins an open transaction instead of opening another one', async () => {
    const { port, runs } = recordingPort();
    const deps = { transaction: port };
    await inTransaction(deps, async (tx) => inTransaction(tx, async () => runs.push('inner')));
    expect(runs).toEqual(['begin', 'inner', 'commit']);
  });

  it('runs an effect right away outside a transaction and after the commit inside one', async () => {
    const order: string[] = [];
    await afterCommitOrNow({}, async () => {
      order.push('now');
    });
    const { port } = recordingPort();
    await inTransaction({ transaction: port }, async (tx) => {
      await afterCommitOrNow(tx, async () => {
        order.push('after');
      });
      order.push('work');
    });
    expect(order).toEqual(['now', 'work', 'after']);
  });

  it('defers through a deferred queue with the options, such as the singleton key', async () => {
    const calls: unknown[] = [];
    const queue: TaskQueue = {
      async enqueue(name, payload, options) {
        calls.push({ name, payload, options });
      },
    };
    const { port } = recordingPort();
    await inTransaction({ transaction: port, queue }, async (tx) => tx.queue.enqueue('import.commit', { organizationId: 'o', batchId: 'b' }, { singletonKey: 'b' }));
    expect(calls).toEqual([{ name: 'import.commit', payload: { organizationId: 'o', batchId: 'b' }, options: { singletonKey: 'b' } }]);
  });
});

describe('createInMemoryTransaction', () => {
  it('puts back every cell written inside a failed transaction, and keeps what a committed one wrote', async () => {
    const transaction = createInMemoryTransaction();
    const a = cell(1);
    const b = cell('x');
    await expect(
      transaction.run(async () => {
        a.set(2);
        b.set('y');
        a.set(3);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect([a.get(), b.get()]).toEqual([1, 'x']);
    await transaction.run(async () => {
      a.set(4);
    });
    expect(a.get()).toBe(4);
  });

  it('runs transactions one after the other, so the second sees what the first committed', async () => {
    const transaction = createInMemoryTransaction();
    const counter = cell(0);
    const increment = () =>
      transaction.run(async () => {
        const read = counter.get();
        await new Promise((resolve) => setTimeout(resolve, 1));
        counter.set(read + 1);
      });
    await Promise.all([increment(), increment(), increment()]);
    expect(counter.get()).toBe(3);
  });

  it('joins when opened inside another one, so a failing inner write rolls back with the outer', async () => {
    const transaction = createInMemoryTransaction();
    const value = cell('start');
    await expect(
      transaction.run(async () => {
        await transaction.run(async () => value.set('inner'));
        throw new Error('outer');
      }),
    ).rejects.toThrow('outer');
    expect(value.get()).toBe('start');
  });

  it('does not touch writes made outside any transaction', async () => {
    const value = cell(0);
    value.set(5);
    expect(value.get()).toBe(5);
  });
});

describe('defineUseCase in a transaction', () => {
  const store = cell<readonly string[]>([]);
  const addTag = defineUseCase({
    name: 'addTag',
    input: z.object({ tag: z.string().min(1) }),
    permission: 'candidate:update',
    audit: { action: 'candidate.updated', target: (input) => ({ type: 'candidate', id: input.tag }) },
    handler: async ({ input }) => {
      store.set([...store.get(), input.tag]);
      return input.tag;
    },
  });
  const actor = userActor({ role: 'recruiter', organizationId: 'org_a' });

  it('rolls the handler writes back when the audit append fails', async () => {
    const before = store.get();
    const error = await addTag({ auditLog: failingAuditLog(new Error('db down')), transaction: createInMemoryTransaction() }, actor, { tag: 'go' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuditWriteError);
    expect(store.get()).toEqual(before);
  });

  it('commits the writes and the audit event together', async () => {
    const auditLog = createInMemoryAuditLog();
    await addTag({ auditLog, transaction: createInMemoryTransaction() }, actor, { tag: 'rust' });
    expect(store.get()).toContain('rust');
    expect(auditLog.events()).toHaveLength(1);
  });

  it('runs a read-only use case without opening a transaction, and a write that skips the audit in one when asked', async () => {
    const { port, runs } = recordingPort();
    const read = defineUseCase({ name: 'read', input: z.object({}), permission: 'job:read', audit: { skip: 'read-only' }, handler: async () => 'r' });
    const write = defineUseCase({ name: 'write', input: z.object({}), permission: 'job:read', audit: { skip: 'audited inside' }, transaction: 'required', handler: async () => 'w' });
    const opted = defineUseCase({
      name: 'opted',
      input: z.object({}),
      permission: 'job:read',
      audit: { action: 'job.updated', target: () => ({ type: 'job', id: 'j' }) },
      transaction: { skip: 'long external call' },
      handler: async () => 'o',
    });
    const deps = { auditLog: createInMemoryAuditLog(), transaction: port };
    await read(deps, actor, {});
    expect(runs).toEqual([]);
    await write(deps, actor, {});
    expect(runs).toEqual(['begin', 'commit']);
    await opted(deps, actor, {});
    expect(runs).toEqual(['begin', 'commit']);
  });
});
