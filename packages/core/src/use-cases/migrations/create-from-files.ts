import { MIGRATION_SHEET_MAX_BYTES, MIGRATION_UPLOAD_NAMES, MIGRATION_LIMITS, migrationConnectorIdSchema, migrationUploadKey, type MigrationBatch } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import type { MigrationConnectorDeps } from '../../migration-fetch-ports.js';
import { defineUseCase } from '../../use-case.js';
import { newConnectorBatch } from './create-from-connector.js';
import { deleteMigrationFile, migrationIdSchema } from './shared.js';

const storedFile = z.strictObject({ sizeBytes: z.number().int().nonnegative() });

export const createMigrationFromFilesInput = z.strictObject({
  connectorId: migrationConnectorIdSchema,
  /** The id the files were stored under (`.../upload/sheet`, `.../upload/cvs`): the api streams them there first. */
  batchId: migrationIdSchema,
  sheet: storedFile,
  cvs: storedFile.optional(),
});

const refusal = (path: string, message: string): ValidationError => new ValidationError([{ path, message }]);

/**
 * Task 6.9: an owner or admin starts a migration from a file-based connector (`input: 'files'`) by uploading its export.
 * The api has already streamed the spreadsheet (and the optional ZIP of CVs) under the batch prefix; the batch starts
 * `fetching` with the connector's maturity and `migration.fetch` is queued. There are no credentials: the fetcher hands
 * the connector a read-only view of the files, and deletes them when the fetch ends, whatever happens. On any refusal
 * the stored files are removed: they are personal data.
 */
export const createMigrationFromFiles = defineUseCase<MigrationConnectorDeps, typeof createMigrationFromFilesInput, MigrationBatch>({
  name: 'createMigrationFromFiles',
  input: createMigrationFromFilesInput,
  permission: 'migration:manage',
  audit: {
    action: 'migration.created',
    target: (_input, result) => ({ type: 'migration_batch', id: result.id }),
    metadata: (input, result) => ({ connectorId: input.connectorId, maturity: result.connectorMaturity, sheetBytes: input.sheet.sizeBytes, ...(input.cvs ? { cvsBytes: input.cvs.sizeBytes } : {}) }),
  },
  transaction: { skip: 'the batch must be committed before its fetch is queued, like the package upload' },
  handler: async ({ deps, actor, input }) => {
    const { organizationId } = actor;
    const discard = async (): Promise<void> => {
      for (const name of MIGRATION_UPLOAD_NAMES) await deleteMigrationFile(deps, organizationId, input.batchId, migrationUploadKey(organizationId, input.batchId, name));
    };
    // An id already taken must not reach the delete: the files of that batch are not ours to remove.
    if (await deps.migrations.findById(organizationId, input.batchId)) throw new ConflictError('migration_exists');
    try {
      const source = deps.sources.find(input.connectorId);
      if (!source) throw refusal('connectorId', 'connector_unknown');
      if (source.input !== 'files') throw refusal('connectorId', 'connector_needs_credentials');
      if (input.sheet.sizeBytes === 0) throw refusal('sheet', 'file_empty');
      if (input.sheet.sizeBytes > MIGRATION_SHEET_MAX_BYTES) throw refusal('sheet', 'sheet_too_large');
      if (input.cvs?.sizeBytes === 0) throw refusal('cvs', 'file_empty');
      if ((input.cvs?.sizeBytes ?? 0) > MIGRATION_LIMITS.totalBytes) throw refusal('cvs', 'package_too_large');
      const batch = newConnectorBatch(deps, actor, input.batchId, source, { done: 0, total: null, upload: { cvs: input.cvs !== undefined } });
      const stored = await deps.migrations.create(batch);
      try {
        await deps.queue.enqueue('migration.fetch', { organizationId, batchId: input.batchId }, { singletonKey: input.batchId });
      } catch {
        await discard();
        return await deps.migrations.transition(organizationId, input.batchId, 'fetching', { status: 'failed', error: 'queue_unavailable', updatedAt: deps.now() });
      }
      return stored;
    } catch (error) {
      await discard();
      throw error;
    }
  },
});
