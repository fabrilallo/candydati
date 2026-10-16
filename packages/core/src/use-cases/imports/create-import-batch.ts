import { emptyImportCounts, importFileKey, IMPORT_LIMITS, pipelineStagesOf, type ImportBatch, type ImportSourceFile } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import type { Actor } from '../../actor.js';
import type { ImportDeps } from '../../import-ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineImportUseCase } from './define.js';
import { deleteBatchFiles } from './shared.js';

/** One path segment, safe as part of a storage key: no folders, no control characters. */
const safeSegment = (name: string): string => {
  const last = name.split(/[\\/]/).pop() ?? '';
  const cleaned = last.replace(/[^\p{L}\p{N}._ ()+-]/gu, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return cleaned === '' ? 'file' : cleaned;
};

const inlineFile = z.object({ fileName: z.string().min(1).max(300), bytes: z.instanceof(Uint8Array) });
/** Already in storage under `importFileKey(organization, batchId, 'source/...')`: the api streams big uploads there instead of buffering them. */
const storedFile = z.object({ fileName: z.string().min(1).max(300), key: z.string().min(1), sizeBytes: z.number().int().nonnegative() });

export const createImportBatchInput = z.object({
  jobId: z.string().min(1),
  stageId: z.string().min(1),
  /** Required when a file is `stored`: the id its keys were made with. */
  batchId: z.string().min(1).optional(),
  files: z.array(z.union([inlineFile, storedFile])).min(1).max(IMPORT_LIMITS.maxFiles),
});

type UploadedFile = z.infer<typeof inlineFile> | z.infer<typeof storedFile>;
const isStored = (file: UploadedFile): file is z.infer<typeof storedFile> => 'key' in file;
const sizeOf = (file: UploadedFile): number => (isStored(file) ? file.sizeBytes : file.bytes.byteLength);

export const createImportBatch = defineImportUseCase({
  name: 'createImportBatch',
  input: createImportBatchInput,
  permission: 'import:manage',
  audit: {
    action: 'import.created',
    target: (_input, result: ImportBatch) => ({ type: 'import_batch', id: result.id }),
    metadata: (input, result: ImportBatch) => ({ jobId: input.jobId, stageId: input.stageId, files: result.counts.files }),
  },
  transaction: { skip: 'uploads the files first (long), then commits the batch before its analysis is queued' },
  handler: async ({ deps, actor, input }): Promise<ImportBatch> => {
    const { organizationId } = actor;
    const id = input.batchId ?? deps.newId();
    const storedPrefix = importFileKey(organizationId, id, 'source/');
    const stored = input.files.filter(isStored);
    // Files streamed to storage before this ran are ours to remove on any refusal.
    const dropStored = () => deleteBatchFiles(deps, organizationId, stored.map((file) => file.key));
    try {
      if (stored.some((file) => !file.key.startsWith(storedPrefix))) throw new ValidationError([{ path: 'files', message: 'invalid_key' }]);
      return await register(deps, actor, input, id);
    } catch (error) {
      await dropStored();
      throw error;
    }
  },
});

/** Names the keys and uploads the inline files; the stored ones are already there. Removes everything on a failure. */
async function storeSources(deps: ImportDeps, organizationId: string, id: string, files: readonly UploadedFile[]): Promise<ImportSourceFile[]> {
  const sourceFiles: ImportSourceFile[] = files.map((file, index) => ({
    key: isStored(file) ? file.key : importFileKey(organizationId, id, `source/${index}-${safeSegment(file.fileName)}`),
    fileName: file.fileName,
    sizeBytes: sizeOf(file),
  }));
  try {
    for (const [index, file] of files.entries()) {
      if (!isStored(file)) await deps.files.put(sourceFiles[index]?.key ?? '', file.bytes, 'application/octet-stream');
    }
  } catch (error) {
    await deleteBatchFiles(deps, organizationId, sourceFiles.map((f) => f.key));
    throw error;
  }
  return sourceFiles;
}

async function register(deps: ImportDeps, actor: Actor, input: z.infer<typeof createImportBatchInput>, id: string): Promise<ImportBatch> {
  const { organizationId } = actor;
  const job = await requireJob(deps, organizationId, input.jobId);
  if (job.status === 'closed') throw new ConflictError('job_closed');
  if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === input.stageId)) {
    throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
  }
  const totalBytes = input.files.reduce((sum, file) => sum + sizeOf(file), 0);
  if (totalBytes > IMPORT_LIMITS.maxBytes) throw new ValidationError([{ path: 'files', message: 'batch_too_large' }]);
  if (input.files.some((file) => sizeOf(file) === 0)) throw new ValidationError([{ path: 'files', message: 'file_empty' }]);
  const sourceFiles = await storeSources(deps, organizationId, id, input.files);
  const batch: ImportBatch = {
    id,
    organizationId,
    jobId: job.id,
    stageId: input.stageId,
    status: 'uploaded',
    createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
    counts: { ...emptyImportCounts(), files: sourceFiles.length },
    mapping: null,
    headers: [],
    sourceFiles,
    error: null,
    createdAt: deps.now(),
    importedAt: null,
    undoneAt: null,
  };
  let stored: ImportBatch;
  try {
    stored = await deps.imports.create(batch);
  } catch (error) {
    await deleteBatchFiles(deps, organizationId, sourceFiles.map((f) => f.key));
    throw error;
  }
  try {
    await deps.queue.enqueue('import.analyze', { organizationId, batchId: id }, { singletonKey: id });
  } catch {
    return deps.imports.save({ ...stored, status: 'failed', error: 'queue_unavailable' });
  }
  return stored;
}
