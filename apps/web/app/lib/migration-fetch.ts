import type { MigrationBatchDto } from '@candydati/domain'

export interface FetchProgress {
  readonly done: number
  /** Null while the source has not said how much there is. */
  readonly total: number | null
  /** 0 to 100 once the total is known, else null (the bar is then indeterminate). */
  readonly percent: number | null
}

/** Pure: how far a connector is in reading the source. */
export const fetchProgress = (counts: Pick<MigrationBatchDto['counts'], 'fetch'>): FetchProgress => {
  const done = counts.fetch?.done ?? 0
  const total = counts.fetch?.total ?? null
  const percent = total !== null && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null
  return { done, total, percent }
}

type PartOf = Pick<MigrationBatchDto, 'id' | 'groupId' | 'part'>

/** Pure: the batches of the same connector fetch, part 1 first. Empty for a migration that is not part of a group. */
export const groupParts = <T extends PartOf>(batches: readonly T[], batch: PartOf): readonly T[] =>
  batch.groupId === null ? [] : batches.filter((other) => other.groupId === batch.groupId).toSorted((a, b) => (a.part ?? 0) - (b.part ?? 0))

/** Pure: how many parts the fetch produced: as it recorded, else as many as are listed (at least one). */
export const partCount = (batch: Pick<MigrationBatchDto, 'counts' | 'groupId'>, parts: readonly unknown[]): number =>
  batch.groupId === null ? 1 : Math.max(batch.counts.fetch?.parts ?? 0, parts.length, 1)
