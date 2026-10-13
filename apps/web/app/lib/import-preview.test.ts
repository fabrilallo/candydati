import { describe, expect, it } from 'vitest'
import { confidenceCounts, filterItems, initialSelection, itemProblems, previewSummary, selectionChanges, setByConfidence, toggleItem } from './import-preview'
import type { ImportItemDto } from './phase8-contract'

const item = (id: string, over: Partial<ImportItemDto> = {}): ImportItemDto => ({
  id,
  included: true,
  confidence: 'high',
  firstName: 'Anna',
  lastName: id,
  email: `${id}@example.com`,
  phone: null,
  headline: null,
  sources: [],
  existing: null,
  conflicts: [],
  flags: [],
  ...over,
})

const items = [
  item('a'),
  item('b', { confidence: 'medium', existing: { id: 'c9', name: 'Anna B' }, conflicts: [{ field: 'phone', kind: 'existing', kept: '1', other: '2' }] }),
  item('c', { confidence: 'low', email: null, flags: ['no_email'], included: false }),
  item('d', { confidence: 'low', existing: { id: 'c8', name: 'Anna D' } }),
]

describe('itemProblems', () => {
  it('reads missing email from the flag or the field, and conflicts from the list or the flag', () => {
    expect(itemProblems(items[0]!)).toEqual([])
    expect(itemProblems(items[1]!)).toEqual(['conflicts'])
    expect(itemProblems(items[2]!)).toEqual(['noEmail'])
    expect(itemProblems(item('e', { email: '' }))).toEqual(['noEmail'])
    expect(itemProblems(item('f', { flags: ['email_conflict'] }))).toEqual(['conflicts'])
  })
})

describe('selection', () => {
  it('starts from what the api proposed', () => {
    expect([...initialSelection(items)]).toEqual(['a', 'b', 'd'])
  })

  it('toggles one item without touching the previous selection', () => {
    const start = initialSelection(items)
    const next = toggleItem(start, 'a', false)
    expect(next.has('a')).toBe(false)
    expect(start.has('a')).toBe(true)
    expect(toggleItem(next, 'c', true).has('c')).toBe(true)
  })

  it('includes or excludes every item of one confidence at once', () => {
    const start = initialSelection(items)
    expect([...setByConfidence(start, items, 'low', false)].toSorted()).toEqual(['a', 'b'])
    expect([...setByConfidence(start, items, 'low', true)].toSorted()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sends only what changed against the api', () => {
    const selection = toggleItem(toggleItem(initialSelection(items), 'c', true), 'a', false)
    expect(selectionChanges(items, selection)).toEqual({ items: [{ itemId: 'a', included: false }, { itemId: 'c', included: true }] })
    expect(selectionChanges(items, initialSelection(items))).toEqual({ items: [] })
  })
})

describe('filterItems', () => {
  it('filters by confidence and by problem, combined', () => {
    const selection = initialSelection(items)
    expect(filterItems(items, selection, { confidence: 'low', problem: 'all' }).map((one) => one.id)).toEqual(['c', 'd'])
    expect(filterItems(items, selection, { confidence: 'all', problem: 'noEmail' }).map((one) => one.id)).toEqual(['c'])
    expect(filterItems(items, selection, { confidence: 'all', problem: 'conflicts' }).map((one) => one.id)).toEqual(['b'])
    expect(filterItems(items, selection, { confidence: 'all', problem: 'merged' }).map((one) => one.id)).toEqual(['b', 'd'])
    expect(filterItems(items, selection, { confidence: 'low', problem: 'excluded' }).map((one) => one.id)).toEqual(['c'])
    expect(filterItems(items, selection, { confidence: 'all', problem: 'all' })).toHaveLength(4)
  })
})

describe('counts', () => {
  it('counts items by confidence', () => {
    expect(confidenceCounts(items)).toEqual({ high: 1, medium: 1, low: 2 })
  })

  it('summarises new, merged, excluded and without email among the included', () => {
    const selection = toggleItem(initialSelection(items), 'c', true)
    expect(previewSummary(items, selection)).toEqual({ created: 2, merged: 2, excluded: 0, noEmail: 1, total: 4 })
    expect(previewSummary(items, initialSelection(items))).toEqual({ created: 1, merged: 2, excluded: 1, noEmail: 0, total: 4 })
  })
})
