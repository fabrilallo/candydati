import { reconcileQueuedWork, type ReconcileDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const RECONCILE_QUEUE = 'tasks.reconcile';
export const RECONCILE_CRON = '*/5 * * * *';

/**
 * Queues again the work whose task went missing between a commit and the send (messages `queued`, exports `pending`,
 * import batches waiting, CV extractions pending): see `reconcileQueuedWork`. Logs counts only.
 */
export const createReconcileQueue = (deps: ReconcileDeps, now: () => Date): QueueDefinition<z.ZodType> =>
  defineQueue({
    name: RECONCILE_QUEUE,
    payload: z.unknown(),
    schedule: { cron: RECONCILE_CRON, data: {} },
    handle: async ({ jobId, logger }) => {
      const result = await reconcileQueuedWork(deps, { now: now() });
      if (result.messages + result.exports + result.imports + result.extractions + result.failed > 0) logger.info({ jobId, ...result }, 'stuck work queued again');
    },
  });
