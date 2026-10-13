import { createDb } from '@tt/db';
import { createEmailProvider, createS3FileStorage, toEmailIdentity } from '@tt/providers';
import { PgBoss } from 'pg-boss';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createDeliverDeps } from './email/deps.js';
import { toEmailSender, toMessagingConfig } from '@tt/providers';
import { createHrWorkerDeps } from './hr/deps.js';
import { createPhase4WorkerDeps } from './automation/deps.js';
import { formatDigestFrom } from './deadlines/digest.js';
import { createPgBossQueue } from './queue/pg-boss-queue.js';
import { createAutomationRunQueue } from './queues/automation-run.js';
import { createDeadlinesScanQueue } from './queues/deadlines-scan.js';
import { createDistributionWorkerDeps } from './distribution/deps.js';
import { createDistributionSyncQueue } from './queues/distribution-sync.js';
import { createWebhookDeliverQueue } from './queues/webhook-deliver.js';
import { createWebhookPublishQueue } from './queues/webhook-publish.js';
import { createPrivacyWorkerDeps } from './privacy/deps.js';
import { createFilesDeleteQueue } from './queues/files-delete.js';
import { createOrganizationExportQueue } from './queues/organization-export.js';
import { createRetentionRunQueue } from './queues/retention-run.js';
import { createCvExtractionDeps } from './cv-extraction/deps.js';
import { createCvExtractQueue } from './queues/cv-extract.js';
import { createImportWorkerDeps } from './import/deps.js';
import { createImportAnalyzeQueue } from './queues/import-analyze.js';
import { createImportCommitQueue } from './queues/import-commit.js';
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
    modelDailyBudget: env.CV_MODEL_DAILY_BUDGET,
    onModelError: (reason) => logger.warn({ reason }, 'cv model failed, keeping the plain text'),
  });
  const provider = createEmailProvider(env.email, (line) => logger.info(line));
  const sender = toEmailSender(provider);
  const deliverDeps = createDeliverDeps({ db: database.db, sender, platform: env.platform, email: env.email });
  const phase4 = createPhase4WorkerDeps({
    db: database.db,
    queue: createPgBossQueue(boss),
    sender,
    identity: toEmailIdentity(provider),
    platform: env.platform,
    email: env.email,
    production: env.NODE_ENV === 'production',
    allowPrivateWebhooks: env.WEBHOOKS_ALLOW_PRIVATE,
  });
  const messaging = toMessagingConfig(env.platform, env.email);
  const privacy = createPrivacyWorkerDeps({ db: database.db, files, queue: createPgBossQueue(boss) });
  const imports = createImportWorkerDeps({
    db: database.db,
    files,
    queue: createPgBossQueue(boss),
    platform: env.platform,
    email: env.email,
    fastModel: env.FAST_MODEL,
    onModelError: (reason) => logger.warn({ reason }, 'cv model failed, keeping the plain text'),
    onMailError: (error) => logger.error({ err: error }, 'reconfirmation email not queued'),
  });
  const hr = createHrWorkerDeps({ db: database.db, sender, config: messaging, onMailError: (error) => logger.error({ err: error }, 'feedback email not sent') });
  const digest = {
    sender,
    from: formatDigestFrom(env.platform.name, `${messaging.emailFromLocal}@${messaging.emailDomain}`),
    platformUrl: env.platform.url,
    locale: env.platform.defaultLocale,
  };
  const queues = [
    ...QUEUE_DEFINITIONS,
    createCvExtractQueue(cvDeps),
    createEmailSendQueue(deliverDeps),
    createAutomationRunQueue(phase4.run),
    createWebhookDeliverQueue(phase4.deliver),
    createWebhookPublishQueue(phase4.publish),
    createDistributionSyncQueue(createDistributionWorkerDeps({ db: database.db, platform: env.platform })),
    createDeadlinesScanQueue({
      scan: phase4.scan,
      feedback: hr.feedback,
      stale: hr.stale,
      digest,
      now: () => new Date(),
    }),
    createImportAnalyzeQueue({ deps: imports.analysis, extractor: imports.extractor }),
    createImportCommitQueue(imports.commit),
    createFilesDeleteQueue(files),
    createOrganizationExportQueue(privacy.organizationExport),
    createRetentionRunQueue({ retention: privacy.retention, digest, now: () => new Date() }),
  ];
  const worker = await startWorker({ boss, logger, queues });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => void shutdown(signal, worker, database.close, logger));
  }
};

main().catch((error: unknown) => {
  pino({ name: 'worker' }).fatal({ err: error }, 'worker startup failed');
  process.exit(1);
});
