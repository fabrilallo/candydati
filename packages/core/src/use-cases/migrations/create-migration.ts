import { MIGRATION_LIMITS, migrationPackageKey, type MigrationBatch } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ConflictError, ValidationError } from '../../errors.js';
import type { MigrationDeps } from '../../migration-ports.js';
import { defineMigrationUseCase } from './define.js';
import { deleteMigrationFile, migrationIdSchema } from './shared.js';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const inlineFile = z.object({ fileName: z.string().min(1).max(300), bytes: z.instanceof(Uint8Array) });
/** Already in storage under `migrationPackageKey(organization, batchId)`: the api streams big uploads there instead of buffering them. */
const storedFile = z.object({ key: z.string().min(1).max(500), sizeBytes: z.number().int().nonnegative() });

export const createMigrationInput = z.object({
  /** Required when the file is `stored`: the id its key was made with. */
  batchId: migrationIdSchema.optional(),
  file: z.union([inlineFile, storedFile]),
});

type Input = z.infer<typeof createMigrationInput>;
type UploadedFile = Input['file'];

const isStored = (file: UploadedFile): file is z.infer<typeof storedFile> => 'key' in file;
const sizeOf = (file: UploadedFile): number => (isStored(file) ? file.sizeBytes : file.bytes.byteLength);
const refuse = (message: string): never => {
  throw new ValidationError([{ path: 'file', message }]);
};

/** Size and shape checks before anything is written. The content is read by the analysis, never here. */
function checkFile(file: UploadedFile, key: string): void {
  if (isStored(file) && file.key !== key) refuse('invalid_key');
  const size = sizeOf(file);
  if (size === 0) refuse('file_empty');
  if (size > MIGRATION_LIMITS.totalBytes) refuse('package_too_large');
  if (!isStored(file) && !ZIP_MAGIC.every((byte, index) => file.bytes[index] === byte)) refuse('not_a_zip');
}

const newBatch = (deps: MigrationDeps, actor: Actor, id: string, packageKey: string): MigrationBatch => ({
  id,
  organizationId: actor.organizationId,
  status: 'uploaded',
  sourceSystem: '',
  producer: '',
  connectorMaturity: 'package',
  createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
  counts: {},
  stageMapping: [],
  excludedJobs: [],
  declarations: null,
  packageKey,
  error: null,
  createdAt: deps.now(),
  updatedAt: deps.now(),
  committedAt: null,
  undoneAt: null,
});

/** Writes the batch and queues its analysis. A batch that cannot be queued is left `failed`, so the operator sees it. */
async function register(deps: MigrationDeps, actor: Actor, id: string, packageKey: string): Promise<MigrationBatch> {
  const stored = await deps.migrations.create(newBatch(deps, actor, id, packageKey));
  try {
    await deps.queue.enqueue('migration.analyze', { organizationId: actor.organizationId, batchId: id }, { singletonKey: id });
  } catch {
    return deps.migrations.transition(actor.organizationId, id, 'uploaded', { status: 'failed', error: 'queue_unavailable', updatedAt: deps.now() });
  }
  return stored;
}

/**
 * Task 3.1: an owner or admin uploads a migration package (ADR 0009). The ZIP is stored under
 * `organizations/{org}/migrations/{batchId}/package.zip`, the batch starts `uploaded` and `migration.analyze` is queued.
 * Nothing about people is read or written here. On any refusal the stored ZIP is removed: it is personal data.
 */
export const createMigrationFromPackage = defineMigrationUseCase({
  name: 'createMigrationFromPackage',
  input: createMigrationInput,
  permission: 'migration:manage',
  audit: {
    action: 'migration.created',
    target: (_input, result: MigrationBatch) => ({ type: 'migration_batch', id: result.id }),
    metadata: (input) => ({ sizeBytes: sizeOf(input.file) }),
  },
  transaction: { skip: 'stores the package first (long), then commits the batch before its analysis is queued' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => {
    const { organizationId } = actor;
    if (isStored(input.file) && input.batchId === undefined) refuse('invalid_key');
    const id = input.batchId ?? deps.newId();
    // An id already taken must not reach storage: its package would be overwritten, then deleted by the refusal.
    if (input.batchId !== undefined && (await deps.migrations.findById(organizationId, id))) throw new ConflictError('migration_exists');
    const key = migrationPackageKey(organizationId, id);
    try {
      checkFile(input.file, key);
      if (!isStored(input.file)) await deps.files.put(key, input.file.bytes, 'application/zip');
      return await register(deps, actor, id, key);
    } catch (error) {
      await deleteMigrationFile(deps, organizationId, id, key);
      throw error;
    }
  },
});
