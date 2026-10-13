import { autoMapColumns, importFileKey, type ImportBatch, type ImportMapping } from '@tt/domain';
import { failImportBatch, recordImportAnalysis, startImportAnalysis, type ImportDeps } from '@tt/core';
import { gatherSources, type FoundCv, type SourceFile } from './gather.js';
import { ImportError } from './limits.js';
import { parseCvs, type ParseCvOptions } from './parse-cvs.js';

export type ImportAnalysisDeps = Pick<ImportDeps, 'imports' | 'importItems' | 'importAnalyses' | 'candidates' | 'files' | 'queue' | 'newId' | 'now'>;

export interface RunImportAnalysisOptions extends ParseCvOptions {
  /** True when pg-boss will not retry: an unexpected failure then fails the batch instead of being retried. */
  readonly lastAttempt?: boolean | undefined;
}

export type ImportAnalysisOutcome = 'ready' | 'failed' | 'skipped';

/** Own failure with a reason safe to show the user. */
class AnalysisRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const safeName = (fileName: string): string => fileName.replace(/[^\p{L}\p{N}._ ()+-]/gu, '_').slice(0, 120) || 'cv';

/** CVs inside an archive are stored next to the originals so the commit can read them one by one. */
function keyOf(batch: ImportBatch, cv: FoundCv, index: number): string {
  return cv.sourceKey ?? importFileKey(batch.organizationId, batch.id, `cv/${index}-${safeName(cv.fileName)}`);
}

async function loadSources(deps: ImportAnalysisDeps, batch: ImportBatch): Promise<readonly SourceFile[]> {
  const sources: SourceFile[] = [];
  for (const file of batch.sourceFiles) sources.push({ key: file.key, fileName: file.fileName, bytes: await deps.files.get(file.key) });
  return sources;
}

/** A failed batch cannot be previewed or committed: the uploaded originals are personal data and go (a failed delete is retried by `files.delete`). */
async function dropSources(deps: ImportAnalysisDeps, batch: ImportBatch): Promise<void> {
  for (const { key } of batch.sourceFiles) {
    await deps.files.delete(key).catch(() => deps.queue.enqueue('files.delete', { organizationId: batch.organizationId, key }).catch(() => undefined));
  }
}

const mappingFor = (headers: readonly string[], filesColumn: string | null): ImportMapping => {
  const mapped = autoMapColumns(headers);
  return filesColumn === null ? mapped : { ...mapped, file: filesColumn };
};

async function analyse(deps: ImportAnalysisDeps, batch: ImportBatch, options: RunImportAnalysisOptions): Promise<void> {
  const gathered = await gatherSources(await loadSources(deps, batch));
  if (gathered.cvs.length === 0 && gathered.rows.length === 0) throw new AnalysisRefused('nothing_to_import');
  const keys = gathered.cvs.map((cv, index) => keyOf(batch, cv, index));
  for (const [index, cv] of gathered.cvs.entries()) {
    if (cv.sourceKey === null) await deps.files.put(keys[index] ?? '', cv.bytes, cv.mediaType);
  }
  const cvs = await parseCvs(gathered.cvs, keys, options);
  await recordImportAnalysis(deps, {
    organizationId: batch.organizationId,
    batchId: batch.id,
    headers: [...gathered.headers],
    cvs: [...cvs],
    rows: [...gathered.rows],
    mapping: mappingFor(gathered.headers, gathered.filesColumn),
  });
}

/**
 * `import.analyze`: opens the stored originals, reads the CVs (text, contacts by regex, the model only when configured)
 * and the sheets, and hands the result to `recordImportAnalysis`, which matches and leaves the batch `ready`. A refused
 * file (unsafe archive, over the limits, nothing usable) fails the batch with a stable reason code; an unexpected error is
 * retried by the queue and fails the batch only on the last attempt. Messages never include file contents.
 */
export async function runImportAnalysis(
  deps: ImportAnalysisDeps,
  payload: { readonly organizationId: string; readonly batchId: string },
  options: RunImportAnalysisOptions = {},
): Promise<ImportAnalysisOutcome> {
  const batch = await deps.imports.findById(payload.organizationId, payload.batchId);
  if (!batch || (batch.status !== 'uploaded' && batch.status !== 'analyzing')) return 'skipped';
  await startImportAnalysis(deps, payload);
  try {
    await analyse(deps, batch, options);
    return 'ready';
  } catch (error) {
    const reason = error instanceof ImportError ? error.code : error instanceof AnalysisRefused ? error.reason : options.lastAttempt === true ? 'analysis_failed' : null;
    if (reason === null) throw error;
    await failImportBatch(deps, { ...payload, reason });
    await dropSources(deps, batch);
    return 'failed';
  }
}
