import { describe, expect, it } from 'vitest';
import { createInMemoryTaskQueue } from '../../testing/index.js';
import type { StuckWorkRepository } from '../../reconcile-ports.js';
import { reconcileQueuedWork, STUCK_AFTER_MINUTES } from './reconcile-queued-work.js';

const NOW = new Date('2026-06-01T10:00:00Z');

const stuck = (rows: Partial<Record<keyof StuckWorkRepository, readonly unknown[]>>): StuckWorkRepository & { readonly cutoffs: Date[] } => {
  const cutoffs: Date[] = [];
  const list = (key: keyof StuckWorkRepository) => async (before: Date) => (cutoffs.push(before), (rows[key] ?? []) as never);
  const failStalledFetches = async (before: Date) => (cutoffs.push(before), (rows.failStalledFetches ?? []).length);
  return { queuedMessages: list('queuedMessages'), pendingExports: list('pendingExports'), pendingExtractions: list('pendingExtractions'), unfinishedImports: list('unfinishedImports'), unfinishedMigrations: list('unfinishedMigrations'), failStalledFetches, cutoffs };
};

describe('reconcileQueuedWork (#3)', () => {
  it('queues again a message stuck in queued, an export stuck in pending, an unfinished import and migration, with singleton keys', async () => {
    const queue = createInMemoryTaskQueue();
    const calls: unknown[] = [];
    const recording = { enqueue: async (...args: Parameters<typeof queue.enqueue>) => (calls.push(args), queue.enqueue(...args)) };
    const repo = stuck({
      queuedMessages: [{ organizationId: 'o', id: 'm1' }],
      pendingExports: [{ organizationId: 'o', id: 'x1' }],
      pendingExtractions: [{ organizationId: 'o', id: 'a1' }],
      unfinishedImports: [{ organizationId: 'o', id: 'b1', status: 'uploaded' }, { organizationId: 'o', id: 'b2', status: 'importing' }],
      unfinishedMigrations: [
        { organizationId: 'o', id: 'g1', status: 'uploaded' },
        { organizationId: 'o', id: 'g2', status: 'analyzing' },
        { organizationId: 'o', id: 'g3', status: 'importing' },
      ],
    });
    const result = await reconcileQueuedWork({ stuck: repo, queue: recording }, { now: NOW });
    expect(result).toEqual({ messages: 1, exports: 1, imports: 2, migrations: 3, extractions: 1, fetchesFailed: 0, failed: 0 });
    expect(calls).toEqual([
      ['email.send', { organizationId: 'o', messageId: 'm1' }, { singletonKey: 'm1', replaceFailed: true }],
      ['organization.export', { organizationId: 'o', exportId: 'x1' }, { singletonKey: 'x1', replaceFailed: true }],
      ['cv.extract', { organizationId: 'o', applicationId: 'a1' }, { singletonKey: 'a1', replaceFailed: true }],
      ['import.analyze', { organizationId: 'o', batchId: 'b1' }, { singletonKey: 'b1', replaceFailed: true }],
      ['import.commit', { organizationId: 'o', batchId: 'b2' }, { singletonKey: 'b2', replaceFailed: true }],
      ['migration.analyze', { organizationId: 'o', batchId: 'g1' }, { singletonKey: 'g1', replaceFailed: true }],
      ['migration.analyze', { organizationId: 'o', batchId: 'g2' }, { singletonKey: 'g2', replaceFailed: true }],
      ['migration.commit', { organizationId: 'o', batchId: 'g3' }, { singletonKey: 'g3', replaceFailed: true }],
    ]);
    expect(repo.cutoffs.every((cutoff) => cutoff.getTime() === NOW.getTime() - STUCK_AFTER_MINUTES * 60_000)).toBe(true);
  });

  it('counts what it could not queue and goes on with the rest', async () => {
    const repo = stuck({ queuedMessages: [{ organizationId: 'o', id: 'm1' }, { organizationId: 'o', id: 'm2' }] });
    const result = await reconcileQueuedWork({ stuck: repo, queue: createInMemoryTaskQueue(new Error('queue down')) }, { now: NOW });
    expect(result).toEqual({ messages: 0, exports: 0, imports: 0, migrations: 0, extractions: 0, fetchesFailed: 0, failed: 2 });
  });

  it('fails connector fetches that stopped moving instead of running them again: their credentials are gone', async () => {
    const queue = createInMemoryTaskQueue();
    const repo = stuck({ failStalledFetches: [{ organizationId: 'o', id: 'f1' }, { organizationId: 'o', id: 'f2' }] });
    const result = await reconcileQueuedWork({ stuck: repo, queue }, { now: NOW });
    expect(result.fetchesFailed).toBe(2);
    expect(queue.jobs()).toEqual([]);
  });
});
