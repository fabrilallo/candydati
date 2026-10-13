import { describe, expect, it } from 'vitest'
import { clickSelection, EMPTY_SELECTION, keepOnly, orderedIds, toggleGroup } from './selection'

const ORDER = ['a', 'b', 'c', 'd', 'e']
const ids = (selection: { ids: ReadonlySet<string> }) => [...selection.ids].sort()

describe('clickSelection', () => {
  it('toggles one id and remembers it as the anchor', () => {
    const one = clickSelection(EMPTY_SELECTION, ORDER, 'b', false)
    expect(ids(one)).toEqual(['b'])
    expect(one.anchor).toBe('b')
    const none = clickSelection(one, ORDER, 'b', false)
    expect(ids(none)).toEqual([])
    expect(none.anchor).toBe('b')
  })

  it('selects the range from the anchor with shift, both directions', () => {
    const anchor = clickSelection(EMPTY_SELECTION, ORDER, 'b', false)
    expect(ids(clickSelection(anchor, ORDER, 'd', true))).toEqual(['b', 'c', 'd'])
    const back = clickSelection(clickSelection(EMPTY_SELECTION, ORDER, 'e', false), ORDER, 'c', true)
    expect(ids(back)).toEqual(['c', 'd', 'e'])
  })

  it('keeps what was selected outside the range', () => {
    const start = clickSelection(clickSelection(EMPTY_SELECTION, ORDER, 'a', false), ORDER, 'c', false)
    expect(ids(clickSelection(start, ORDER, 'e', true))).toEqual(['a', 'c', 'd', 'e'])
  })

  it('without an anchor in the order, shift acts as a plain toggle', () => {
    expect(ids(clickSelection(EMPTY_SELECTION, ORDER, 'c', true))).toEqual(['c'])
    expect(ids(clickSelection({ ids: new Set(), anchor: 'zz' }, ORDER, 'c', true))).toEqual(['c'])
  })

  it('never changes the selection it was given', () => {
    const before = clickSelection(EMPTY_SELECTION, ORDER, 'a', false)
    clickSelection(before, ORDER, 'c', true)
    expect(ids(before)).toEqual(['a'])
  })
})

describe('toggleGroup', () => {
  it('selects a whole column, or clears it when it is already all selected', () => {
    const all = toggleGroup(EMPTY_SELECTION, ['b', 'c'])
    expect(ids(all)).toEqual(['b', 'c'])
    expect(ids(toggleGroup(all, ['b', 'c']))).toEqual([])
    expect(ids(toggleGroup(clickSelection(EMPTY_SELECTION, ORDER, 'b', false), ['b', 'c']))).toEqual(['b', 'c'])
  })

  it('does nothing with an empty group', () => {
    expect(toggleGroup(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION)
  })
})

describe('keepOnly and orderedIds', () => {
  it('drops ids that are no longer visible', () => {
    const selection = toggleGroup(EMPTY_SELECTION, ['a', 'x'])
    expect(ids(keepOnly(selection, ORDER))).toEqual(['a'])
    expect(keepOnly(toggleGroup(EMPTY_SELECTION, ['a']), ORDER).ids.size).toBe(1)
  })

  it('lists the selected ids in visible order', () => {
    expect(orderedIds(toggleGroup(EMPTY_SELECTION, ['d', 'a']), ORDER)).toEqual(['a', 'd'])
  })
})
