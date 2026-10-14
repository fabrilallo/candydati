import { createDrizzleUnitOfWork, safeErrorSerializer } from '@tt/core';
import { createDb } from '@tt/db';
import { createPgBossQueue, createS3FileStorage } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { createQueues } from './compose.js';
import { loadEnv } from './config/env.js';
import { startWorker, type WorkerHandle } from './worker.js';

const PG_BOSS_SCHEMA = 'pgboss';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const shutdown = async (
  signal: string,
  worker: WorkerHandle,
  closeDb: () => Promise<void>,
  logger: pino.Logger,
): Promise<void> => {
  logger.info({ signal }, 'shutdown signal received');
  const exitCode = await worker.stop().then(closeDb).then(
    () => 0,
    (error: unknown) => {
      logger.error({ err: error }, 'graceful shutdown failed');
      return 1;
    },
  );
  process.exit(exitCode);
};

const main = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const logger = pino({ level: env.LOG_LEVEL, name: 'worker', serializers: { err: safeErrorSerializer } });
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: PG_BOSS_SCHEMA });
  boss.on('error', (error: Error) => logger.error({ err: error }, 'pg-boss error'));
  await boss.start();

  const database = createDb(env.DATABASE_URL);
  // The one composition root: every repository on the pool and the unit of work that rebinds them to a transaction.
  const queue = createPgBossQueue(boss);
  // Tasks queued inside a transaction are sent on its connection: they exist if and only if it commits.
  const uow = createDrizzleUnitOfWork(database.db, (error) => logger.error({ err: error }, 'side effect after commit failed'), queue);
  const files = createS3FileStorage(env.s3);
  await files.ensureBucket();
  const queues = createQueues({ env, logger, uow, queue, files });
  const worker = await startWorker({ boss, logger, queues });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal, worker, database.close, logger));
  }
};

main().catch((error: unknown) => {
  pino({ name: 'worker', serializers: { err: safeErrorSerializer } }).fatal({ err: error }, 'worker startup failed');
  process.exit(1);
});
