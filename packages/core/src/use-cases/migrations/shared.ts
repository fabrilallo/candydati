import { migrationFilePrefix, type MigrationBatch, type MigrationStatus } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../../errors.js';
import type { MigrationDeps } from '../../migration-ports.js';

/** Ids end up in storage keys: letters, digits, `-` and `_` only. */
export const migrationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/, 'migration_id');

/** A batch of another organization is indistinguishable from a missing one. */
export async function requireMigration(deps: Pick<MigrationDeps, 'migrations'>, organizationId: string, id: string): Promise<MigrationBatch> {
  const batch = await deps.migrations.findById(organizationId, id);
  if (!batch) throw new NotFoundError('Migration not found.');
  return batch;
}

export function assertMigrationStatus(batch: MigrationBatch, allowed: readonly MigrationStatus[]): void {
  if (!allowed.includes(batch.status)) throw new ConflictError(`migration_${batch.status}`);
}

/**
 * Deletes a stored file of a migration (the package is personal data). Only keys under the organization's migrations
 * prefix; a failed delete is queued for a retry by `files.delete`.
 */
export async function deleteMigrationFile(deps: Pick<MigrationDeps, 'files' | 'queue'>, organizationId: string, batchId: string, key: string): Promise<void> {
  if (!key.startsWith(migrationFilePrefix(organizationId, batchId))) return;
  try {
    await deps.files.delete(key);
  } catch {
    await deps.queue.enqueue('files.delete', { organizationId, key }).catch(() => undefined);
  }
}
