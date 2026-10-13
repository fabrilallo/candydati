import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { QUEUE_DEFINITIONS } from './queues/definitions.js';
import { startWorker, type WorkerHandle } from './worker.js';

const PG_BOSS_SCHEMA = 'pgboss';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const shutdown = async (signal: string, worker: WorkerHandle, logger: pino.Logger): Promise<void> => {
  logger.info({ signal }, 'shutdown signal received');
  const exitCode = await worker.stop().then(
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
  const logger = pino({ level: env.LOG_LEVEL, name: 'worker' });
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: PG_BOSS_SCHEMA });
  boss.on('error', (error: Error) => logger.error({ err: error }, 'pg-boss error'));
  await boss.start();

  const worker = await startWorker({ boss, logger, queues: QUEUE_DEFINITIONS });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal, worker, logger));
  }
};

main().catch((error: unknown) => {
  pino({ name: 'worker' }).fatal({ err: error }, 'worker startup failed');
  process.exit(1);
});
