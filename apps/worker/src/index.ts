import { createDrizzleUnitOfWork, safeErrorSerializer } from '@tt/core';
import { createDb } from '@tt/db';
import { createErrorReporter, createPgBossQueue, createS3FileStorage, withRequestId, type ErrorReporter } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import type { Server } from 'node:http';
import { createQueues } from './compose.js';
import { loadEnv, type WorkerEnv } from './config/env.js';
import { registerBacklogMetrics } from './observability/backlog-metrics.js';
import { startHealthServer } from './observability/health-server.js';
import { createWorkerMetrics } from './observability/worker-metrics.js';
import { startWorker, type WorkerHandle } from './worker.js';

const PG_BOSS_SCHEMA = 'pgboss';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

interface Lifecycle {
  readonly worker: WorkerHandle;
  readonly closeDb: () => Promise<void>;
  readonly health: Server | null;
  readonly logger: pino.Logger;
  readonly markStopping: () => void;
}

const closeServer = (server: Server | null): Promise<void> =>
  server === null ? Promise.resolve() : new Promise((resolve) => void server.close(() => resolve()));

const shutdown = async (signal: string, { worker, closeDb, health, logger, markStopping }: Lifecycle): Promise<void> => {
  logger.info({ signal }, 'shutdown signal received');
  // Not ready first: whatever watches the worker stops counting on it while it drains its jobs.
  markStopping();
  const exitCode = await worker.stop().then(() => closeServer(health)).then(closeDb).then(
    () => 0,
    (error: unknown) => {
      logger.error({ err: error }, 'graceful shutdown failed');
      return 1;
    },
  );
  process.exit(exitCode);
};

/** A crash is logged and reported before the process goes down, as Node would do by itself. */
const reportFatalErrors = (reporter: ErrorReporter, logger: pino.Logger): void => {
  const crash = (origin: string) => (error: unknown) => {
    logger.fatal({ err: error, origin }, 'fatal error');
    reporter.capture(error, { service: 'worker' });
    setTimeout(() => process.exit(1), 1_000).unref();
  };
  process.on('uncaughtException', crash('uncaughtException'));
  process.on('unhandledRejection', crash('unhandledRejection'));
};

const createReporter = (env: WorkerEnv, logger: pino.Logger): ErrorReporter =>
  createErrorReporter({
    dsn: env.observability.sentryDsn,
    service: 'worker',
    environment: env.observability.sentryEnvironment ?? env.NODE_ENV,
    release: env.observability.sentryRelease ?? undefined,
    describe: safeErrorSerializer,
    onProblem: (reason) => logger.warn({ reason }, 'error reporting'),
  });

const main = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const logger = pino({ level: env.LOG_LEVEL, name: 'worker', serializers: { err: safeErrorSerializer } });
  const reporter = createReporter(env, logger);
  reportFatalErrors(reporter, logger);
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: PG_BOSS_SCHEMA });
  boss.on('error', (error: Error) => logger.error({ err: error }, 'pg-boss error'));
  await boss.start();

  const database = createDb(env.DATABASE_URL);
  // The one composition root: every repository on the pool and the unit of work that rebinds them to a transaction.
  // Jobs queued by a job carry the request id of the one that queued them.
  const queue = withRequestId(createPgBossQueue(boss));
  // Tasks queued inside a transaction are sent on its connection: they exist if and only if it commits.
  const uow = createDrizzleUnitOfWork(database.db, (error) => logger.error({ err: error }, 'side effect after commit failed'), queue);
  const files = createS3FileStorage(env.s3);
  await files.ensureBucket();
  const queues = createQueues({ env, logger, uow, queue, files });
  const metrics = createWorkerMetrics((error) => logger.error({ err: error }, 'metrics collector failed'));
  registerBacklogMetrics(metrics.registry, database.pool);
  const worker = await startWorker({ boss, logger, queues, observer: metrics.observer, reporter });
  let ready = true;
  const health =
    env.WORKER_PORT === 0
      ? null
      : await startHealthServer({
          port: env.WORKER_PORT,
          host: env.WORKER_HOST,
          checkDatabase: async () => void (await database.pool.query('select 1')),
          isReady: () => ready,
          metrics: metrics.registry,
          metricsToken: env.observability.metricsToken,
          onError: (error) => logger.error({ err: error }, 'worker health check failed'),
        });
  if (health) logger.info({ port: env.WORKER_PORT, metrics: env.observability.metricsToken !== null }, 'worker health server listening');
  const lifecycle: Lifecycle = { worker, closeDb: database.close, health, logger, markStopping: () => void (ready = false) };
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal, lifecycle));
  }
};

main().catch((error: unknown) => {
  pino({ name: 'worker', serializers: { err: safeErrorSerializer } }).fatal({ err: error }, 'worker startup failed');
  process.exit(1);
});
