import type { ImportBatch, ImportItem } from '@candydati/domain';

export interface ImportBatchView {
  readonly batch: ImportBatch;
  readonly items: readonly ImportItem[];
  /** Items matching the filter, across pages. */
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}
