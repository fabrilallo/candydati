import { DAY_MS } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { ImportDeps } from '../../import-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { purgeBatchData } from './shared.js';

/** Default age after which an import that was never committed is purged. */
export const IMPORT_STALE_DAYS = 7;

type SweepDeps = Pick<ImportDeps, 'imports' | 'importItems' | 'importAnalyses' | 'files' | 'queue'>;

export interface PurgeStaleImportsResult {
  /** Batches whose proposed people, parsed CVs and original files were purged. */
  readonly purged: number;
  /** Batches whose purge failed: the next sweep retries them. Ids only. */
  readonly failed: readonly { readonly organizationId: string; readonly batchId: string }[];
}

const input = z.object({ now: z.date(), olderThanDays: z.number().int().min(1) });

/**
 * Retention sweep for imports. A batch that was abandoned (uploaded, analyzing, ready, importing) for more than N days
 * is failed with reason `expired`, and its proposed people, parsed CVs and uploaded originals are deleted. A batch that
 * still holds originals after its own purge was interrupted gets the purge finished. Committed batches are untouched.
 */
export const purgeStaleImports = defineSystemJob<SweepDeps, typeof input, PurgeStaleImportsResult>({
  name: 'purgeStaleImports',
  input,
  handler: async ({ deps, input: { now, olderThanDays } }): Promise<PurgeStaleImportsResult> => {
    const stale = await deps.imports.listStale(new Date(now.getTime() - olderThanDays * DAY_MS));
    let purged = 0;
    const failed: { organizationId: string; batchId: string }[] = [];
    for (const batch of stale) {
      try {
        const current =
          batch.status === 'done' || batch.status === 'failed' || batch.status === 'undone'
            ? batch
            : await deps.imports.transition(batch.organizationId, batch.id, batch.status, { status: 'failed', error: 'expired' });
        await purgeBatchData(deps, current);
        purged += 1;
      } catch (error) {
        // A batch that changed under the sweep (committed, failed by its worker) is not stale any more.
        if (!(error instanceof ConflictError)) failed.push({ organizationId: batch.organizationId, batchId: batch.id });
      }
    }
    return { purged, failed };
  },
});
