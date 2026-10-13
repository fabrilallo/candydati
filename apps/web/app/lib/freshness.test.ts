import { describe, expect, it } from 'vitest'
import { FOCUS_REFETCH_GAP_MS, isReusedEntry, shouldRefetchOnFocus } from './freshness'

describe('isReusedEntry', () => {
  it('flags a success entry found on client navigation, never during hydration', () => {
    expect(isReusedEntry(false, 'success')).toBe(true)
    expect(isReusedEntry(true, 'success')).toBe(false)
    expect(isReusedEntry(false, 'pending')).toBe(false)
    expect(isReusedEntry(false, 'idle')).toBe(false)
  })
})

describe('shouldRefetchOnFocus', () => {
  const now = 1_000_000
  it('refetches when idle and not brand new', () => {
    expect(shouldRefetchOnFocus({ status: 'success', lastFetchedAt: now - FOCUS_REFETCH_GAP_MS, now })).toBe(true)
  })
  it('waits while loading or right after a fetch', () => {
    expect(shouldRefetchOnFocus({ status: 'pending', lastFetchedAt: 0, now })).toBe(false)
    expect(shouldRefetchOnFocus({ status: 'success', lastFetchedAt: now - 100, now })).toBe(false)
  })
})
