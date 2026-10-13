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

const describeIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[]): string =>
  issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');

/** The sender chooses the retry limit; without metadata a failure is treated as final. */
const isLastAttempt = (job: WorkerJob): boolean => (job.retryCount ?? 0) >= (job.retryLimit ?? 0);

const processJob = async (definition: QueueDefinition, job: WorkerJob, logger: Logger): Promise<void> => {
  const parsed = definition.payload.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(
      `Invalid payload for queue "${definition.name}" (job ${job.id}): ${describeIssues(parsed.error.issues)}`,
    );
  }
  const jobLogger = logger.child({ queue: definition.name, jobId: job.id });
  await definition.handle({ jobId: job.id, payload: parsed.data, logger: jobLogger, lastAttempt: isLastAttempt(job) });
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
  }
  logger.info({ queues: queues.map((definition) => definition.name) }, 'worker ready');
  return { stop: createStop(boss, logger) };
};
