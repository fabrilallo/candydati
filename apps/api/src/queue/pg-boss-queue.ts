import type { TaskQueue } from '@tt/core';

/** The only part of pg-boss the api uses. The real `PgBoss` satisfies it; tests pass a fake. */
export interface BossSender {
  send(name: string, data: object, options: { retryLimit: number; retryDelay: number; retryBackoff: boolean }): Promise<string | null>;
  createQueue(name: string): Promise<void>;
}

export const TASK_RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true } as const;
/** Webhook receivers can be down for a while: five retries, 30 s then doubling (the worker uses the same policy). */
export const WEBHOOK_RETRY = { retryLimit: 5, retryDelay: 30, retryBackoff: true } as const;

const retryFor = (name: string) => (name === 'webhook.deliver' ? WEBHOOK_RETRY : TASK_RETRY);

/**
 * `TaskQueue` over pg-boss. The queue is created on first use per name (idempotent), so the api never depends on the
 * worker having started first. A `null` id means pg-boss dropped the job: that is a failure, not a success.
 */
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
