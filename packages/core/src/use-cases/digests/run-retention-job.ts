import type { ImportDeps } from '../../import-ports.js';
import type { RetentionDeps } from '../../privacy-ports.js';
import type { MigrationPurgeDeps } from '../../migration-commit-ports.js';
import { purgeStaleImports } from '../imports/purge-stale-imports.js';
import { purgeEndedMigrations } from '../migrations/purge-ended-migrations.js';
import { runRetention, type RetentionFailure } from '../privacy/run-retention.js';
import { pruneDeliveryLog, type DeliveryLogDeps } from '../webhooks/prune-delivery-log.js';
import type { DigestJobConfig } from './run-deadline-scan.js';
import { sendDigests, type DigestSendResult } from './send-digests.js';

export interface RetentionJobDeps {
  readonly retention: RetentionDeps;
  /** The import sweep: batches never committed are purged after `importStaleDays`. */
  readonly imports: Pick<ImportDeps, 'imports' | 'importItems' | 'importAnalyses' | 'files' | 'queue'>;
  readonly importStaleDays: number;
  /** Ended migrations: their package and issues are deleted some days later. Absent: no migration purge. */
  readonly migrations?: MigrationPurgeDeps | undefined;
  /** Outbox and webhook delivery rows are pruned after `deliveryLogRetentionDays`. Absent: no pruning. */
  readonly deliveryLog?: DeliveryLogDeps | undefined;
  readonly deliveryLogRetentionDays?: number | undefined;
  readonly digest: DigestJobConfig;
}

export interface RetentionJobResult extends DigestSendResult {
  readonly warned: number;
  readonly erased: number;
  readonly exportsDeleted: number;
  readonly digests: number;
  readonly staleImportsPurged: number;
  /** Ids only, for the logs. */
  readonly staleImportFailures: readonly { readonly organizationId: string; readonly batchId: string }[];
  readonly migrationsPurged: number;
  /** Ids only, for the logs. */
  readonly migrationPurgeFailures: readonly { readonly organizationId: string; readonly batchId: string }[];
  readonly erasureFailures: readonly Pick<RetentionFailure, 'organizationId' | 'candidateId'>[];
  readonly orphanedFiles: readonly { readonly organizationId: string; readonly keys: readonly string[] }[];
  readonly prunedEvents: number;
  readonly prunedDeliveries: number;
}

/**
 * The daily job (`retention.run`): warns owners and admins about applications expiring soon (one digest per person,
 * claimed with its send), erases the ones past their expiry, deletes expired organization exports, purges imports never
 * committed, purges ended migrations and prunes the delivery log. Returns counts and ids only.
 */
export async function runRetentionJob(deps: RetentionJobDeps, now: Date): Promise<RetentionJobResult> {
  const result = await runRetention(deps.retention, { now });
  const sweep = await purgeStaleImports(deps.imports, { now, olderThanDays: deps.importStaleDays });
  const migrations = deps.migrations ? await purgeEndedMigrations(deps.migrations, { now }) : { purged: 0, failed: [] };
  const mail = await sendDigests({ transaction: deps.digest.transaction, notifications: deps.retention.notifications, mail: deps.digest.mail, now: () => now }, result.digests);
  const pruned = deps.deliveryLog ? await pruneDeliveryLog(deps.deliveryLog, { now, retentionDays: deps.deliveryLogRetentionDays }) : { events: 0, deliveries: 0 };
  return {
    warned: result.runs.reduce((sum, run) => sum + run.warned, 0),
    erased: result.runs.reduce((sum, run) => sum + run.erased, 0),
    exportsDeleted: result.exportsDeleted,
    digests: result.digests.length,
    staleImportsPurged: sweep.purged,
    staleImportFailures: sweep.failed,
    migrationsPurged: migrations.purged,
    migrationPurgeFailures: migrations.failed,
    erasureFailures: result.failures.map(({ organizationId, candidateId }) => ({ organizationId, candidateId })),
    orphanedFiles: result.orphanedFiles,
    prunedEvents: pruned.events,
    prunedDeliveries: pruned.deliveries,
    ...mail,
  };
}
