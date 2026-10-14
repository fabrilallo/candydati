import { emptyImportCounts, IMPORT_ITEMS_PAGE_MAX, type ImportBatch, type ImportCounts, type ImportItem } from '@tt/domain';
import { ConflictError, NotFoundError } from '../../errors.js';
import type { ImportDeps } from '../../import-ports.js';
import type { ImportBatchView } from './views.js';

export const SYSTEM_ACTOR = { type: 'system', id: null, onBehalfOfUserId: null } as const;
export const DEFAULT_ITEMS_LIMIT = 50;
export { IMPORT_ITEMS_PAGE_MAX };

/** A batch of another organization is indistinguishable from a missing one. */
export async function requireBatch(deps: Pick<ImportDeps, 'imports'>, organizationId: string, id: string): Promise<ImportBatch> {
  const batch = await deps.imports.findById(organizationId, id);
  if (!batch) throw new NotFoundError('Import not found.');
  return batch;
}

export function assertStatus(batch: ImportBatch, allowed: readonly ImportBatch['status'][]): void {
  if (!allowed.includes(batch.status)) throw new ConflictError(`import_${batch.status}`);
}

export const withCounts = (batch: ImportBatch, counts: Partial<ImportCounts>): ImportBatch => ({ ...batch, counts: { ...emptyImportCounts(), ...batch.counts, ...counts } });

export const countOf = (items: readonly ImportItem[]): Pick<ImportCounts, 'items' | 'included' | 'noEmail'> => ({
  items: items.length,
  included: items.filter((item) => item.included).length,
  noEmail: items.filter((item) => item.proposal.flags.includes('no_email')).length,
});

export async function loadBatchPage(
  deps: Pick<ImportDeps, 'importItems'>,
  batch: ImportBatch,
  page: number,
  limit: number,
  confidence?: ImportItem['proposal']['confidence'],
): Promise<ImportBatchView> {
  const { items, total } = await deps.importItems.list({ organizationId: batch.organizationId, batchId: batch.id, page, limit, confidence });
  return { batch, items, total, page, limit };
}

/** Deletes the stored originals of a batch: what the database no longer references. A failure queues a retry. */
export async function deleteBatchFiles(deps: Pick<ImportDeps, 'files' | 'queue'>, organizationId: string, keys: readonly string[]): Promise<void> {
  for (const key of new Set(keys)) {
    if (!key.startsWith(`organizations/${organizationId}/imports/`)) continue;
    try {
      await deps.files.delete(key);
    } catch {
      await deps.queue.enqueue('files.delete', { organizationId, key }).catch(() => undefined);
    }
  }
}

type PurgeDeps = Pick<ImportDeps, 'imports' | 'importItems' | 'importAnalyses' | 'files' | 'queue'>;

/**
 * Deletes the working data of a batch that will never be committed (done, failed, expired): the proposed people and
 * parsed inputs are personal data. Files first, while the analysis still names them; every step can run again, so a
 * retry after a crash finishes the purge. The `sourceFiles` column goes last: while it is set, the purge is unfinished.
 */
export async function purgeBatchData(deps: PurgeDeps, batch: ImportBatch): Promise<ImportBatch> {
  const analysis = await deps.importAnalyses.find(batch.organizationId, batch.id);
  await deleteBatchFiles(deps, batch.organizationId, [...batch.sourceFiles.map((f) => f.key), ...(analysis?.cvs.map((cv) => cv.key) ?? [])]);
  await deps.importItems.deleteByBatch(batch.organizationId, batch.id);
  await deps.importAnalyses.delete(batch.organizationId, batch.id);
  // Only the column: a full-row save from this snapshot would undo counts another run added meanwhile.
  return batch.sourceFiles.length === 0 ? batch : deps.imports.transition(batch.organizationId, batch.id, batch.status, { sourceFiles: [] });
}
