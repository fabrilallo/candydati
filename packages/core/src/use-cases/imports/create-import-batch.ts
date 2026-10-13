import { emptyImportCounts, importFileKey, IMPORT_LIMITS, pipelineStagesOf, type ImportBatch, type ImportSourceFile } from '@tt/domain';
import { z } from 'zod';
import { ConflictError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineImportUseCase } from './define.js';
import { deleteBatchFiles } from './shared.js';

/** One path segment, safe as part of a storage key: no folders, no control characters. */
const safeSegment = (name: string): string => {
  const last = name.split(/[\\/]/).pop() ?? '';
  const cleaned = last.replace(/[^\p{L}\p{N}._ ()+-]/gu, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return cleaned === '' ? 'file' : cleaned;
};

export const createImportBatchInput = z.object({
  jobId: z.string().min(1),
  stageId: z.string().min(1),
  files: z
    .array(z.object({ fileName: z.string().min(1).max(300), bytes: z.instanceof(Uint8Array) }))
    .min(1)
    .max(IMPORT_LIMITS.maxFiles),
});

/**
 * Registers an import (PLAN Fase 8): checks the target job and stage, stores the uploaded originals under the batch
 * prefix and queues `import.analyze`. The files are ZIPs of CVs, CSV, XLSX or a Notion export: the worker unpacks and
 * parses them, with the zip-bomb limits. If the task cannot be queued the batch is `failed`, never stuck `uploaded`.
 */
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
    const job = await requireJob(deps, organizationId, input.jobId);
    if (job.status === 'closed') throw new ConflictError('job_closed');
    if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === input.stageId)) {
      throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    }
    const totalBytes = input.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    if (totalBytes > IMPORT_LIMITS.maxBytes) throw new ValidationError([{ path: 'files', message: 'batch_too_large' }]);
    if (input.files.some((file) => file.bytes.byteLength === 0)) throw new ValidationError([{ path: 'files', message: 'file_empty' }]);
    const id = deps.newId();
    const sourceFiles: ImportSourceFile[] = input.files.map((file, index) => ({
      key: importFileKey(organizationId, id, `source/${index}-${safeSegment(file.fileName)}`),
      fileName: file.fileName,
      sizeBytes: file.bytes.byteLength,
    }));
    try {
      for (const [index, file] of input.files.entries()) await deps.files.put(sourceFiles[index]?.key ?? '', file.bytes, 'application/octet-stream');
    } catch (error) {
      await deleteBatchFiles(deps, organizationId, sourceFiles.map((f) => f.key));
      throw error;
    }
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
      await deps.queue.enqueue('import.analyze', { organizationId, batchId: id });
    } catch {
      return deps.imports.save({ ...stored, status: 'failed', error: 'queue_unavailable' });
    }
    return stored;
  },
});
