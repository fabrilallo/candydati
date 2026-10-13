/** Minimum time between two refetches triggered by the window coming back into focus. */
export const FOCUS_REFETCH_GAP_MS = 5_000

export interface FocusState {
  readonly status: string
  /** Epoch ms of the last time the data was (re)fetched. */
  readonly lastFetchedAt: number
  readonly now: number
}

/** Pure: refetch on focus only when nothing is loading and the data is not brand new. */
export const shouldRefetchOnFocus = ({ status, lastFetchedAt, now }: FocusState): boolean =>
  status !== 'pending' && now - lastFetchedAt >= FOCUS_REFETCH_GAP_MS

/**
 * Pure: an entry that is already `success` when a screen sets up (outside hydration) was filled by an earlier visit:
 * Nuxt would serve it as is, so the screen must refetch once mounted. During hydration the server payload is right.
 */
export const isReusedEntry = (hydrating: boolean, status: string): boolean => !hydrating && status === 'success'
