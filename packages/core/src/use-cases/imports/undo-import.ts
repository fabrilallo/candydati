import type { ImportBatch } from '@tt/domain';
import { z } from 'zod';
import { groupBy } from '../../group-by.js';
import { toAuditActor } from '../../actor.js';
import type { ImportUndoDeps } from '../../import-ports.js';
import { defineUseCase, type UseCase } from '../../use-case.js';
import { eraseCandidateData, FileCleanupError } from '../privacy/erase-candidate-data.js';
import { assertStatus, requireBatch, withCounts } from './shared.js';

export interface UndoImportResult {
  readonly batch: ImportBatch;
  /** Applications erased. */
  readonly erased: number;
  /** People who had reconfirmed: their data is theirs to keep, so the undo leaves them. */
  readonly skippedReconfirmed: number;
  /** Candidates whose erasure failed: run the undo again. The batch stays `done` while any remains. */
  readonly failed: number;
}

/**
 * Undoes a whole import while it is `done` (or `failed` after part of it was imported) (PRODUCT.md §3.1): erases, through `eraseCandidateData` with reason `import_undone`,
 * every application the batch created that is still waiting for reconfirmation. A candidate the batch created goes
 * entirely (when nothing else of theirs remains); for someone who already existed only the applications, notes, files
 * and messages the batch added go. People who reconfirmed are skipped and counted. The batch becomes `undone`.
 */
export const undoImport: UseCase<ImportUndoDeps, UndoImportResult> = defineUseCase({
  name: 'undoImport',
  input: z.object({ batchId: z.string().min(1) }),
  permission: 'import:manage',
  audit: {
    action: 'import.undone',
    target: (input) => ({ type: 'import_batch', id: input.batchId }),
    metadata: (_input, result: UndoImportResult) => ({ erased: result.erased, skippedReconfirmed: result.skippedReconfirmed, failed: result.failed }),
  },
  handler: async ({ deps, actor, input }): Promise<UndoImportResult> => {
    const batch = await requireBatch(deps, actor.organizationId, input.batchId);
    assertStatus(batch, ['done', 'failed']);
    const applications = await deps.applications.listByImportBatch(batch.organizationId, batch.id);
    let erased = 0;
    let skipped = 0;
    let failed = 0;
    for (const [candidateId, group] of groupBy(applications, (a) => a.candidateId)) {
      const pending = group.filter((a) => a.consentStatus === 'to_renew');
      if (pending.length === 0) {
        skipped += 1;
        continue;
      }
      try {
        const result = await eraseCandidateData(deps, {
          organizationId: batch.organizationId,
          candidateId,
          applicationIds: pending.map((a) => a.id),
          reason: 'import_undone',
          actor: toAuditActor(actor),
        });
        erased += result.applicationCount;
      } catch (error) {
        // The erasure committed; only stored files are left over (queued for deletion or reported). It is done.
        if (error instanceof FileCleanupError) erased += error.result.applicationCount;
        else failed += 1;
      }
    }
    const counts = { erased: batch.counts.erased + erased, skippedReconfirmed: skipped };
    const saved = await deps.imports.save({
      ...withCounts(batch, counts),
      ...(failed === 0 ? { status: 'undone' as const, undoneAt: deps.now() } : {}),
    });
    return { batch: saved, erased, skippedReconfirmed: skipped, failed };
  },
});
