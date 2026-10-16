import { createInMemoryTaskQueue } from '@candydati/core/testing';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createReconcileQueue, RECONCILE_CRON, RECONCILE_QUEUE } from './reconcile.js';

const none = async () => [];

describe('tasks.reconcile', () => {
  it('runs every five minutes, queues the stuck work again and logs counts only', async () => {
    const queue = createInMemoryTaskQueue();
    const stuck = { queuedMessages: async () => [{ organizationId: 'o', id: 'm1' }], pendingExports: none, pendingExtractions: none, unfinishedImports: none };
    const definition = createReconcileQueue({ stuck, queue }, () => new Date('2026-06-01T10:00:00Z'));
    expect(definition.name).toBe(RECONCILE_QUEUE);
    expect(definition.schedule).toEqual({ cron: RECONCILE_CRON, data: {} });
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    await definition.handle({ jobId: 'j1', payload: {}, logger, lastAttempt: true, attempt: 1 });
    expect(queue.jobs()).toEqual([{ name: 'email.send', payload: { organizationId: 'o', messageId: 'm1' } }]);
    expect(info).toHaveBeenCalledWith({ jobId: 'j1', messages: 1, exports: 0, imports: 0, extractions: 0, failed: 0 }, 'stuck work queued again');
  });

  it('stays quiet when nothing is stuck', async () => {
    const definition = createReconcileQueue({ stuck: { queuedMessages: none, pendingExports: none, pendingExtractions: none, unfinishedImports: none }, queue: createInMemoryTaskQueue() }, () => new Date());
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');
    await definition.handle({ jobId: 'j1', payload: {}, logger, lastAttempt: true, attempt: 1 });
    expect(info).not.toHaveBeenCalled();
  });
});
