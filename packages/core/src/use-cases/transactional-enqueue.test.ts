import { describe, expect, it } from 'vitest';
import type { TaskQueue } from '../intake-ports.js';
import { buildMessage, createInMemoryTaskQueue } from '../testing/index.js';
import { inTransaction, type TransactionPort } from '../transaction.js';
import { enqueueAutomations } from './automations/enqueue.js';
import { enqueueDelivery } from './messaging/send-message.js';

/** A transaction that owns the queue (as the Postgres one does with pg-boss) and records where each step happened. */
const owning = (log: string[], failWith?: Error) => {
  const root: TaskQueue = { enqueue: async () => void log.push('sent after commit') };
  const bound: TaskQueue = {
    enqueue: async (name) => {
      if (failWith) throw failWith;
      log.push(`in transaction: ${name}`);
    },
  };
  const transaction: TransactionPort = {
    run: async (work) => {
      const result = await work(new Map([[root, bound]]));
      log.push('commit');
      return result;
    },
  };
  return { root, transaction };
};

const message = buildMessage({ id: 'msg_1', organizationId: 'org_a', status: 'queued' });
const unusedMessages = { transition: async () => Promise.reject(new Error('must not be called')) } as never;

describe('enqueues inside a transaction that owns the queue (#3)', () => {
  it('sends the delivery task inside the transaction, before the commit', async () => {
    const log: string[] = [];
    const { root, transaction } = owning(log);
    await inTransaction({ transaction, queue: root, messages: unusedMessages }, async (tx) => expect(await enqueueDelivery(tx, message)).toBe(true));
    expect(log).toEqual(['in transaction: email.send', 'commit']);
  });

  it('sends the automation task inside the transaction, and a failure fails the transaction instead of being swallowed', async () => {
    const log: string[] = [];
    const { root, transaction } = owning(log);
    await inTransaction({ transaction, queue: root }, async (tx) => enqueueAutomations(tx, 'org_a', 'app_1', 'stage-1'));
    expect(log).toEqual(['in transaction: automation.run', 'commit']);
    const failing = owning([], new Error('pg-boss insert failed'));
    await expect(inTransaction({ transaction: failing.transaction, queue: failing.root }, async (tx) => enqueueAutomations(tx, 'org_a', 'app_1', 'stage-1'))).rejects.toThrow('pg-boss insert failed');
  });

  it('keeps the old behaviour with a queue the transaction does not own: sent after the commit', async () => {
    const queue = createInMemoryTaskQueue();
    const transaction: TransactionPort = { run: (work) => work(new Map()) };
    await inTransaction({ transaction, queue }, async (tx) => enqueueAutomations(tx, 'org_a', 'app_1', 'stage-1'));
    expect(queue.jobs()).toEqual([{ name: 'automation.run', payload: { organizationId: 'org_a', applicationId: 'app_1', stageId: 'stage-1' } }]);
  });
});
