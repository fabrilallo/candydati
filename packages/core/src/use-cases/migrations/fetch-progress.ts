import type { MigrationBatch, MigrationFetchCounts } from '@candydati/domain';
import type { MigrationFetchDeps } from '../../migration-fetch-ports.js';

/** Temporary file slots are reserved this many at a time: one batch write per hundred downloaded files. */
export const FILE_SLOT_BLOCK = 100;
/** Default least time between two progress writes. */
export const PROGRESS_INTERVAL_MS = 5_000;

export interface FetchProgress {
  progress(done: number, total: number | null): Promise<void>;
  reserveFiles(upTo: number): Promise<void>;
  /** Where the fetch stands now, written or not. */
  current(): MigrationFetchCounts;
}

/**
 * Keeps the batch informed while a connector runs: progress (throttled), which also refreshes `updatedAt` so the
 * reconciler does not take a long fetch for a dead one, and the reserved temporary file slots, written BEFORE a slot is
 * used so the purge can always find what a crashed fetch left in storage.
 */
export function trackFetchProgress(deps: MigrationFetchDeps, batch: MigrationBatch): FetchProgress {
  const interval = deps.progressIntervalMs ?? PROGRESS_INTERVAL_MS;
  let state: MigrationFetchCounts = { done: 0, total: null, ...batch.counts.fetch };
  let lastWrite = Number.NEGATIVE_INFINITY;
  const write = async (): Promise<void> => {
    lastWrite = deps.now().getTime();
    await deps.migrations.transition(batch.organizationId, batch.id, 'fetching', { counts: { ...batch.counts, fetch: state }, updatedAt: deps.now() });
  };
  return {
    async progress(done, total) {
      state = { ...state, done, total };
      if (deps.now().getTime() - lastWrite >= interval) await write();
    },
    async reserveFiles(upTo) {
      if (upTo <= (state.reservedFiles ?? 0)) return;
      state = { ...state, reservedFiles: Math.ceil(upTo / FILE_SLOT_BLOCK) * FILE_SLOT_BLOCK };
      await write();
    },
    current: () => state,
  };
}
