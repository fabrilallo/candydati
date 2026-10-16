import { formatDigestFrom, type DrizzleUnitOfWork, type FileStorage, type TaskQueue } from '@candydati/core';
import { createEmailProvider, toEmailIdentity, toEmailSender, toMessagingConfig } from '@candydati/providers';
import type { WorkerEnv } from './config/env.js';
import { createDeliverDeps } from './email/deps.js';
import { createHrWorkerDeps } from './hr/deps.js';
import { createPhase4WorkerDeps } from './automation/deps.js';
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
import { createMigrationWorkerDeps } from './migration/deps.js';
import { createMigrationAnalyzeQueue } from './queues/migration-analyze.js';
import { createMigrationCommitQueue } from './queues/migration-commit.js';
import { createMigrationFetchQueue } from './queues/migration-fetch.js';
import { createEmailSendQueue } from './queues/email-send.js';
import { createReconcileQueue } from './queues/reconcile.js';
import { QUEUE_DEFINITIONS } from './queues/definitions.js';
import type { Logger } from 'pino';

export interface Composition {
  readonly env: WorkerEnv;
  readonly logger: Logger;
  readonly uow: DrizzleUnitOfWork;
  /** Bound to pg-boss; tasks queued inside a transaction go out on its connection. */
  readonly queue: TaskQueue;
  readonly files: FileStorage;
}

/** Every queue the worker serves: the static definitions plus one handler per task, wired from the same unit of work. */
export function createQueues(composition: Composition) {
  const shared = createSharedDeps(composition);
  return [...QUEUE_DEFINITIONS, ...createTaskQueues(composition, shared), ...createMaintenanceQueues(composition, shared)];
}

type Shared = ReturnType<typeof createSharedDeps>;

function createSharedDeps({ env, logger, uow, files, queue }: Composition) {
  const provider = createEmailProvider(env.email, (line) => logger.info(line));
  const sender = toEmailSender(provider);
  const messaging = toMessagingConfig(env.platform, env.email);
  const phase4 = createPhase4WorkerDeps({
    uow,
    queue,
    sender,
    identity: toEmailIdentity(provider),
    platform: env.platform,
    email: env.email,
    production: env.NODE_ENV === 'production',
    allowPrivateWebhooks: env.WEBHOOKS_ALLOW_PRIVATE,
  });
  const imports = createImportWorkerDeps({
    uow,
    files,
    queue,
    platform: env.platform,
    email: env.email,
    fastModel: env.FAST_MODEL,
    onModelError: (reason) => logger.warn({ reason }, 'cv model failed, keeping the plain text'),
    onMailError: (error) => logger.error({ err: error }, 'reconfirmation email not queued'),
  });
  const hr = createHrWorkerDeps({ uow, sender, config: messaging, onMailError: (error) => logger.error({ err: error }, 'feedback email not sent') });
  const digest = {
    transaction: uow.transaction,
    mail: {
      sender,
      from: formatDigestFrom(env.platform.name, `${messaging.emailFromLocal}@${messaging.emailDomain}`),
      platformUrl: env.platform.url,
      locale: env.platform.defaultLocale,
    },
  };
  const migrations = createMigrationWorkerDeps({
    uow,
    files,
    queue,
    platform: env.platform,
    email: env.email,
    authSecret: env.BETTER_AUTH_SECRET,
    onFetchError: (info) => logger.warn({ ...info }, 'migration fetch failed'),
  });
  return { sender, phase4, imports, hr, digest, migrations, privacy: createPrivacyWorkerDeps({ uow, files, queue }) };
}

function createTaskQueues({ env, logger, uow, files }: Composition, { sender, phase4, imports, hr, digest, migrations }: Shared) {
  const cvDeps = createCvExtractionDeps({
    uow,
    files,
    fastModel: env.FAST_MODEL,
    modelDailyBudget: env.CV_MODEL_DAILY_BUDGET,
    onModelError: (reason) => logger.warn({ reason }, 'cv model failed, keeping the plain text'),
  });
  return [
    createCvExtractQueue(cvDeps),
    createEmailSendQueue(createDeliverDeps({ uow, sender, platform: env.platform, email: env.email })),
    createAutomationRunQueue(phase4.run),
    createWebhookDeliverQueue(phase4.deliver),
    createWebhookPublishQueue(phase4.publish),
    createDistributionSyncQueue(createDistributionWorkerDeps({ uow, platform: env.platform })),
    createDeadlinesScanQueue({ scan: phase4.scan, feedback: hr.feedback, stale: hr.stale, digest, now: () => new Date() }),
    createImportAnalyzeQueue({ deps: imports.analysis, extractor: imports.extractor }),
    createImportCommitQueue(imports.commit),
    createMigrationAnalyzeQueue(migrations.analysis),
    createMigrationCommitQueue(migrations.commit),
    createMigrationFetchQueue(migrations.fetch),
  ];
}

function createMaintenanceQueues({ env, uow, files, queue }: Composition, { imports, privacy, digest, migrations }: Shared) {
  return [
    createFilesDeleteQueue(files),
    // Uses the queue outside any transaction: it repairs what a transaction could not queue.
    createReconcileQueue({ stuck: uow.repositories.stuck, queue, files }, () => new Date()),
    createOrganizationExportQueue(privacy.organizationExport),
    createRetentionRunQueue({
      retention: privacy.retention,
      imports: imports.commit,
      importStaleDays: env.IMPORT_STALE_DAYS,
      migrations: migrations.purge,
      deliveryLog: { outbox: uow.repositories.outbox, deliveries: uow.repositories.deliveries },
      deliveryLogRetentionDays: env.DELIVERY_LOG_RETENTION_DAYS,
      jobViews: uow.repositories.jobViews,
      digest,
      now: () => new Date(),
    }),
  ];
}
