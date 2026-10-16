import { createHash } from 'node:crypto';
import type { BindableTaskQueue, EnqueueOptions, SqlExecutor, TaskName, TaskQueue } from '@candydati/core';

export interface RetryPolicy {
  readonly retryLimit: number;
  /** Seconds before the first retry; doubles on each one with `retryBackoff`. */
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  /** Longest wait between two retries, in seconds. */
  readonly retryDelayMax?: number;
}

export interface SendOptions extends RetryPolicy {
  /** A job id derived from the singleton key: pg-boss inserts with `ON CONFLICT DO NOTHING`, so a repeat is dropped. */
  readonly id?: string;
  readonly singletonKey?: string;
  /** The caller's connection (a transaction): the job row is inserted there and commits or rolls back with it. */
  readonly db?: SqlExecutor;
}

/** The only part of pg-boss the api and the worker use to enqueue. The real `PgBoss` satisfies it; tests pass a fake. */
export interface BossSender {
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
  createQueue(name: string): Promise<void>;
  /** The stored job, in any state, or null (pg-boss keeps finished jobs until its own cleanup). */
  getJobById(name: string, id: string): Promise<{ readonly state: string } | null>;
  deleteJob(name: string, id: string): Promise<unknown>;
}

/** States of a job that will never run again but still hold its id, so a repeat send would be dropped. */
const DEAD_STATES: readonly string[] = ['failed', 'cancelled'];

export const TASK_RETRY: RetryPolicy = { retryLimit: 3, retryDelay: 30, retryBackoff: true };
/** Webhook receivers can be down for a day: 14 retries, 30 s then doubling up to 6 h, so at least 24 h in all. */
export const WEBHOOK_RETRY: RetryPolicy = { retryLimit: 14, retryDelay: 30, retryBackoff: true, retryDelayMax: 6 * 60 * 60 };
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
 * `TaskQueue` over pg-boss, shared by the api and the worker. The queue is created on first use per name (idempotent,
 * on pg-boss's own connection), so neither depends on the other having started first. A `null` id means pg-boss dropped
 * the job: a failure, unless the task has a singleton key, where it means the same task was already queued (the point of
 * the key). `bindTo(executor)` sends on the caller's transaction instead: the unit of work uses it so a task exists if
 * and only if the transaction that queued it committed.
 */
/** pg-boss inserts with `ON CONFLICT DO NOTHING` on the id: a job that failed for good would block its key until pg-boss cleans up. */
async function removeDeadJob(boss: BossSender, name: string, id: string): Promise<void> {
  const existing = await boss.getJobById(name, id);
  if (existing && DEAD_STATES.includes(existing.state)) await boss.deleteJob(name, id);
}

export function createPgBossQueue(boss: BossSender): BindableTaskQueue {
  const created = new Set<string>();
  const sender = (db: SqlExecutor | undefined): TaskQueue => ({
    async enqueue(name, payload, options) {
      if (!created.has(name)) {
        await boss.createQueue(name);
        created.add(name);
      }
      const sendOptions = optionsFor(name, options);
      if (options?.replaceFailed && sendOptions.id) await removeDeadJob(boss, name, sendOptions.id);
      const id = await boss.send(name, payload, db ? { ...sendOptions, db } : sendOptions);
      if (id === null && options?.singletonKey === undefined) throw new Error(`Task ${name} was not queued.`);
    },
  });
  return { ...sender(undefined), bindTo: (executor) => sender(executor) };
}
