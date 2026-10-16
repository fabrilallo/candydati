import { DAY_MS, MIGRATION_PURGE_DAYS, migrationFetchFileKey, migrationFilePrefix, type MigrationBatch } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { MigrationPurgeDeps } from '../../migration-commit-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { deleteMigrationFile } from './shared.js';

export const MIGRATION_PURGE_LIMIT = 500;

export interface PurgeEndedMigrationsResult {
  /** Batches whose package and issues were deleted. */
  readonly purged: number;
  /** Batches whose purge failed: the next run retries them. Ids only. */
  readonly failed: readonly { readonly organizationId: string; readonly batchId: string }[];
}

/**
 * A connector fetch that died left its downloaded files in temporary slots (`.../fetch/{n}`); the fetch recorded how many
 * slots it reserved before using them, so they are all found. Missing slots are not an error.
 */
async function deleteFetchLeftovers(deps: MigrationPurgeDeps, batch: MigrationBatch): Promise<void> {
  const prefix = migrationFilePrefix(batch.organizationId, batch.id);
  for (let slot = 0; slot < (batch.counts.fetch?.reservedFiles ?? 0); slot += 1) {
    await deleteMigrationFile(deps, batch.organizationId, batch.id, migrationFetchFileKey(prefix, slot));
  }
}

const input = z.object({
  now: z.date(),
  olderThanDays: z.number().int().min(1).default(MIGRATION_PURGE_DAYS),
  limit: z.number().int().min(1).max(5000).default(MIGRATION_PURGE_LIMIT),
});

/**
 * Task 3.6, part of the daily retention job: some days after a migration ended (`done`, `failed` or `undone`), its
 * package ZIP and its analysis findings are deleted: they are personal data, and the batch row keeps the counts. The
 * file goes first (a failed delete is queued again), then the issues, then `purgedAt` is set with the status written
 * again, which also wipes any connector credentials left. Every step can run again, so an interrupted purge finishes on
 * the next run.
 */
export const purgeEndedMigrations = defineSystemJob<MigrationPurgeDeps, typeof input, PurgeEndedMigrationsResult>({
  name: 'purgeEndedMigrations',
  input,
  handler: async ({ deps, input: { now, olderThanDays, limit } }): Promise<PurgeEndedMigrationsResult> => {
    const ended = await deps.migrations.listToPurge(new Date(now.getTime() - olderThanDays * DAY_MS), limit);
    let purged = 0;
    const failed: { organizationId: string; batchId: string }[] = [];
    for (const batch of ended) {
      try {
        await deleteMigrationFile(deps, batch.organizationId, batch.id, batch.packageKey);
        await deleteFetchLeftovers(deps, batch);
        await deps.migrationIssues.deleteByBatch(batch.organizationId, batch.id);
        await deps.migrations.transition(batch.organizationId, batch.id, batch.status, { status: batch.status, purgedAt: now });
        purged += 1;
      } catch (error) {
        // A batch that changed under the purge (an undo ran meanwhile) is purged on a later run.
        if (!(error instanceof ConflictError)) failed.push({ organizationId: batch.organizationId, batchId: batch.id });
      }
    }
    return { purged, failed };
  },
});
