import type { TaskQueue } from '@tt/core';

/** The only part of pg-boss the worker uses to enqueue. The real `PgBoss` satisfies it; tests pass a fake. */
export interface BossSender {
  send(name: string, data: object, options: RetryPolicy): Promise<string | null>;
  createQueue(name: string): Promise<void>;
}

export interface RetryPolicy {
  readonly retryLimit: number;
  /** Seconds before the first retry; doubles on each one with `retryBackoff`. */
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
}

export const TASK_RETRY: RetryPolicy = { retryLimit: 3, retryDelay: 30, retryBackoff: true };
/** Webhook receivers can be down for a while: five retries, 30 s then doubling. */
export const WEBHOOK_RETRY: RetryPolicy = { retryLimit: 5, retryDelay: 30, retryBackoff: true };

/** A stored file that must go (erasure): eight attempts, 60 s then doubling, so storage can be down for hours. */
export const FILES_DELETE_RETRY: RetryPolicy = { retryLimit: 8, retryDelay: 60, retryBackoff: true };

/** A distribution channel (a job board) can be down as long as a webhook receiver: same policy. */
const retryFor = (name: string): RetryPolicy => (name === 'webhook.deliver' || name === 'distribution.sync' ? WEBHOOK_RETRY : name === 'files.delete' ? FILES_DELETE_RETRY : TASK_RETRY);

/** `TaskQueue` over pg-boss, with the same rules as the api: queue created on first use, a dropped job is a failure. */
export function createPgBossQueue(boss: BossSender): TaskQueue {
  const created = new Set<string>();
  return {
    async enqueue(name, payload) {
      if (!created.has(name)) {
        await boss.createQueue(name);
        created.add(name);
      }
      const id = await boss.send(name, payload, retryFor(name));
      if (id === null) throw new Error(`Task ${name} was not queued.`);
    },
  };
}
