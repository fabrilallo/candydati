import { createDb } from '@tt/db';
import { createEmailProvider, createS3FileStorage } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createDeliverDeps } from './email/deps.js';
import { toEmailSender } from '@tt/providers';
import { createCvExtractionDeps } from './cv-extraction/deps.js';
import { createCvExtractQueue } from './queues/cv-extract.js';
import { createEmailSendQueue } from './queues/email-send.js';
import { QUEUE_DEFINITIONS } from './queues/definitions.js';
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
  const logger = pino({ level: env.LOG_LEVEL, name: 'worker' });
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: PG_BOSS_SCHEMA });
  boss.on('error', (error: Error) => logger.error({ err: error }, 'pg-boss error'));
  await boss.start();

  const database = createDb(env.DATABASE_URL);
  const files = createS3FileStorage(env.s3);
  await files.ensureBucket();
  const cvDeps = createCvExtractionDeps({
    db: database.db,
    files,
    fastModel: env.FAST_MODEL,
    onModelError: (reason) => logger.warn({ reason }, 'cv model failed, keeping the plain text'),
  });
  const sender = toEmailSender(createEmailProvider(env.email, (line) => logger.info(line)));
  const deliverDeps = createDeliverDeps({ db: database.db, sender, platform: env.platform, email: env.email });
  const queues = [...QUEUE_DEFINITIONS, createCvExtractQueue(cvDeps), createEmailSendQueue(deliverDeps)];
  const worker = await startWorker({ boss, logger, queues });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal, worker, database.close, logger));
  }
};

main().catch((error: unknown) => {
  pino({ name: 'worker' }).fatal({ err: error }, 'worker startup failed');
  process.exit(1);
});
