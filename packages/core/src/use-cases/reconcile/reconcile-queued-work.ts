import { z } from 'zod';
import type { EnqueueOptions, TaskName, TaskPayloads, TaskQueue } from '../../intake-ports.js';
import type { StuckWorkRepository } from '../../reconcile-ports.js';
import { defineSystemJob } from '../../use-case.js';

/** Waiting longer than this without its task having run: the task is queued again. */
export const STUCK_AFTER_MINUTES = 15;
export const RECONCILE_LIMIT = 200;

/** A task for a row still waiting is queued again even when an earlier task of the same key ended failed. */
const REQUEUE = (key: string): EnqueueOptions => ({ singletonKey: key, replaceFailed: true });

export interface ReconcileDeps {
  readonly stuck: StuckWorkRepository;
  readonly queue: TaskQueue;
}

export interface ReconcileResult {
  readonly messages: number;
  readonly exports: number;
  readonly imports: number;
  /** CV extractions still pending whose task was never queued (the queue was down right after the application committed). */
  readonly extractions: number;
  /** Tasks that could not be queued this time; the next run tries again. */
  readonly failed: number;
}

const inputSchema = z.object({ now: z.date(), limit: z.number().int().min(1).max(5000).default(RECONCILE_LIMIT) });

/**
 * System job (every few minutes). Wherever the queue could not take part in the transaction that stored the work, a
 * crash or an outage between the commit and the send leaves a row waiting forever: a message `queued`, an export
 * `pending`, an import batch `uploaded` or `importing`, a CV extraction `pending` (its task is queued after the application commits). Their tasks are queued again with the row id as singleton key,
 * so a task still known to the queue is not duplicated, and the handlers are idempotent anyway.
 */
export const reconcileQueuedWork = defineSystemJob<ReconcileDeps, typeof inputSchema, ReconcileResult>({
  name: 'reconcileQueuedWork',
  input: inputSchema,
  handler: async ({ deps, input }) => {
    const before = new Date(input.now.getTime() - STUCK_AFTER_MINUTES * 60_000);
    let failed = 0;
    const send = async <N extends TaskName>(name: N, payload: TaskPayloads[N], options: EnqueueOptions): Promise<boolean> => {
      try {
        await deps.queue.enqueue(name, payload, options);
        return true;
      } catch {
        failed += 1;
        return false;
      }
    };
    let messages = 0;
    for (const row of await deps.stuck.queuedMessages(before, input.limit)) if (await send('email.send', { organizationId: row.organizationId, messageId: row.id }, REQUEUE(row.id))) messages += 1;
    let exports = 0;
    for (const row of await deps.stuck.pendingExports(before, input.limit)) if (await send('organization.export', { organizationId: row.organizationId, exportId: row.id }, REQUEUE(row.id))) exports += 1;
    let extractions = 0;
    for (const row of await deps.stuck.pendingExtractions(before, input.limit)) if (await send('cv.extract', { organizationId: row.organizationId, applicationId: row.id }, REQUEUE(row.id))) extractions += 1;
    let imports = 0;
    for (const row of await deps.stuck.unfinishedImports(before, input.limit)) {
      const name = row.status === 'uploaded' ? 'import.analyze' : 'import.commit';
      if (await send(name, { organizationId: row.organizationId, batchId: row.id }, REQUEUE(row.id))) imports += 1;
    }
    return { messages, exports, imports, extractions, failed };
  },
});
