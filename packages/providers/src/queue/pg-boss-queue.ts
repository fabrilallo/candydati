import { createHash } from 'node:crypto';
import type { EnqueueOptions, TaskName, TaskQueue } from '@tt/core';

export interface RetryPolicy {
  readonly retryLimit: number;
  /** Seconds before the first retry; doubles on each one with `retryBackoff`. */
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
}

export interface SendOptions extends RetryPolicy {
  /** A job id derived from the singleton key: pg-boss inserts with `ON CONFLICT DO NOTHING`, so a repeat is dropped. */
  readonly id?: string;
  readonly singletonKey?: string;
}

/** The only part of pg-boss the api and the worker use to enqueue. The real `PgBoss` satisfies it; tests pass a fake. */
export interface BossSender {
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
  createQueue(name: string): Promise<void>;
}

export const TASK_RETRY: RetryPolicy = { retryLimit: 3, retryDelay: 30, retryBackoff: true };
/** Webhook receivers can be down for a while: five retries, 30 s then doubling. */
export const WEBHOOK_RETRY: RetryPolicy = { retryLimit: 5, retryDelay: 30, retryBackoff: true };
/** A stored file that must go (erasure): eight attempts, 60 s then doubling, so storage can be down for hours. */
export const FILES_DELETE_RETRY: RetryPolicy = { retryLimit: 8, retryDelay: 60, retryBackoff: true };

/** A distribution channel (a job board) can be down as long as a webhook receiver: same policy. */
const retryFor = (name: string): RetryPolicy =>
  name === 'webhook.deliver' || name === 'distribution.sync' ? WEBHOOK_RETRY : name === 'files.delete' ? FILES_DELETE_RETRY : TASK_RETRY;

/** A stable UUID (version 5 layout) for `name` + `key`: the same task key always gives the same pg-boss job id. */
export function singletonJobId(name: string, key: string): string {
  const hex = createHash('sha1').update(`${name}\u0000${key}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

const optionsFor = (name: TaskName, options: EnqueueOptions | undefined): SendOptions => {
  const key = options?.singletonKey;
  return key === undefined ? retryFor(name) : { ...retryFor(name), id: singletonJobId(name, key), singletonKey: key };
};

/**
 * `TaskQueue` over pg-boss, shared by the api and the worker. The queue is created on first use per name (idempotent),
 * so neither depends on the other having started first. A `null` id means pg-boss dropped the job: a failure, unless the
 * task has a singleton key, where it means the same task was already queued (the point of the key).
 */
export function createPgBossQueue(boss: BossSender): TaskQueue {
  const created = new Set<string>();
  return {
    async enqueue(name, payload, options) {
      if (!created.has(name)) {
        await boss.createQueue(name);
        created.add(name);
      }
      const id = await boss.send(name, payload, optionsFor(name, options));
      if (id === null && options?.singletonKey === undefined) throw new Error(`Task ${name} was not queued.`);
    },
  };
}
