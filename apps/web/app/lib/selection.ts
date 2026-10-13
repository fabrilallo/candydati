/**
 * Multi-selection over an ordered list (the cards of the board, column by column): click toggles one, shift-click
 * selects the range from the last clicked item, a group toggle selects or clears a column. Always a new value.
 */
export interface Selection {
  readonly ids: ReadonlySet<string>
  /** Last item clicked without shift: where a shift range starts. */
  readonly anchor: string | null
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null }

const toggled = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => (ids.has(id) ? new Set([...ids].filter((item) => item !== id)) : new Set([...ids, id]))

/** Pure: the selection after a click on `id`; with `shift`, everything between the anchor and `id` is selected. */
export const clickSelection = (selection: Selection, order: readonly string[], id: string, shift: boolean): Selection => {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor)
  const to = order.indexOf(id)
  if (!shift || from === -1 || to === -1) return { ids: toggled(selection.ids, id), anchor: id }
  const [start, end] = from <= to ? [from, to] : [to, from]
  return { ids: new Set([...selection.ids, ...order.slice(start, end + 1)]), anchor: selection.anchor }
}

/** Pure: selects every id of the group, or clears them all when they are all selected already. */
export const toggleGroup = (selection: Selection, group: readonly string[]): Selection => {
  if (group.length === 0) return selection
  const all = group.every((id) => selection.ids.has(id))
  const ids = all ? new Set([...selection.ids].filter((id) => !group.includes(id))) : new Set([...selection.ids, ...group])
  return { ids, anchor: selection.anchor }
}

/** Pure: forgets ids that are not in `visible` (filtered out, moved away, reloaded). */
export const keepOnly = (selection: Selection, visible: readonly string[]): Selection => ({
  ids: new Set([...selection.ids].filter((id) => visible.includes(id))),
  anchor: selection.anchor !== null && visible.includes(selection.anchor) ? selection.anchor : null,
})

/** Pure: the selected ids in the order they appear. */
export const orderedIds = (selection: Selection, order: readonly string[]): readonly string[] => order.filter((id) => selection.ids.has(id))
