import { safeErrorCode } from '@tt/core';
import type { Logger } from 'pino';
import type { QueueDefinition } from './queues/definitions.js';

const STOP_TIMEOUT_MS = 30_000;

/** The only job fields the worker reads. */
export interface WorkerJob {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  /** Present because the worker asks for metadata: retries done so far and allowed. */
  readonly retryCount?: number;
  readonly retryLimit?: number;
}

export interface WorkerStopOptions {
  readonly graceful?: boolean;
  readonly timeout?: number;
}

/** The subset of the pg-boss API the worker uses. The real PgBoss satisfies it; tests pass a fake. */
export interface WorkerBoss {
  createQueue(name: string): Promise<void>;
  work(name: string, options: { readonly includeMetadata: true }, handler: (jobs: WorkerJob[]) => Promise<void>): Promise<string>;
  schedule(name: string, cron: string, data: object): Promise<void>;
  stop(options?: WorkerStopOptions): Promise<void>;
}

export interface StartWorkerOptions {
  readonly boss: WorkerBoss;
  readonly logger: Logger;
  readonly queues: readonly QueueDefinition[];
}

export interface WorkerHandle {
  /** Stops the boss gracefully. Safe to call more than once: the boss is stopped a single time. */
  readonly stop: () => Promise<void>;
}

const assertUniqueQueueNames = (queues: readonly QueueDefinition[]): void => {
  const names = queues.map((definition) => definition.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate queue name(s): ${[...new Set(duplicates)].join(', ')}`);
  }
};

/** Field paths only: neither the values nor the messages, which can echo what was sent. */
const fieldsOf = (issues: readonly { path: readonly PropertyKey[] }[]): readonly string[] =>
  [...new Set(issues.map((issue) => issue.path.map(String).join('.') || '(root)'))];

/** The sender chooses the retry limit; without metadata a failure is treated as final. */
const isLastAttempt = (job: WorkerJob): boolean => (job.retryCount ?? 0) >= (job.retryLimit ?? 0);

/**
 * One job. An invalid payload can never succeed: it is logged (field paths only) and completed, not retried. A
 * failing handler is logged with the queue, the job id, the attempt and a safe error code (never the message, which
 * can carry personal data), then rethrown so pg-boss retries it.
 */
const processJob = async (definition: QueueDefinition, job: WorkerJob, logger: Logger): Promise<void> => {
  const parsed = definition.payload.safeParse(job.data);
  if (!parsed.success) {
    logger.error({ queue: definition.name, jobId: job.id, fields: fieldsOf(parsed.error.issues) }, 'invalid job payload, dropped');
    return;
  }
  const jobLogger = logger.child({ queue: definition.name, jobId: job.id });
  const attempt = (job.retryCount ?? 0) + 1;
  const lastAttempt = isLastAttempt(job);
  try {
    await definition.handle({ jobId: job.id, payload: parsed.data, logger: jobLogger, lastAttempt, attempt });
  } catch (error) {
    logger.error({ queue: definition.name, jobId: job.id, attempt, lastAttempt, error: safeErrorCode(error) }, 'job failed');
    throw error;
  }
};

const createBatchHandler =
  (definition: QueueDefinition, logger: Logger) =>
  async (jobs: WorkerJob[]): Promise<void> => {
    for (const job of jobs) {
      await processJob(definition, job, logger);
    }
  };

const createStop = (boss: WorkerBoss, logger: Logger): (() => Promise<void>) => {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= (async () => {
      logger.info('worker stopping');
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      logger.info('worker stopped');
    })();
    return stopping;
  };
};

/** Creates each queue and registers its handler. The boss must already be started. */
export const startWorker = async ({ boss, logger, queues }: StartWorkerOptions): Promise<WorkerHandle> => {
  assertUniqueQueueNames(queues);
  for (const definition of queues) {
    await boss.createQueue(definition.name);
    await boss.work(definition.name, { includeMetadata: true }, createBatchHandler(definition, logger));
    if (definition.schedule) await boss.schedule(definition.name, definition.schedule.cron, definition.schedule.data);
  }
  logger.info({ queues: queues.map((definition) => definition.name) }, 'worker ready');
  return { stop: createStop(boss, logger) };
};
