import type { Confidence, ImportItemDto, ItemsInput } from './phase8-contract'

/**
 * The "Anteprima" step in pure functions: which items are in, filters by confidence and problem, bulk changes by
 * confidence. The selection is client state (a set of included ids) until the user moves on.
 */
export type Selection = ReadonlySet<string>
export type ItemProblem = 'noEmail' | 'conflicts'
export type ProblemFilter = 'all' | 'noEmail' | 'conflicts' | 'merged' | 'excluded'
export type ConfidenceFilter = 'all' | Confidence

export interface PreviewFilters {
  readonly confidence: ConfidenceFilter
  readonly problem: ProblemFilter
}

export const PROBLEM_FILTERS: readonly ProblemFilter[] = ['all', 'noEmail', 'conflicts', 'merged', 'excluded']

const hasNoEmail = (item: ImportItemDto): boolean => item.flags.includes('no_email') || !item.email || item.email.trim() === ''

/** Pure: what the user should look at before importing this item. */
export const itemProblems = (item: ImportItemDto): readonly ItemProblem[] => [
  ...(hasNoEmail(item) ? ['noEmail' as const] : []),
  ...(item.conflicts.length > 0 || item.flags.includes('email_conflict') ? ['conflicts' as const] : []),
]

export const initialSelection = (items: readonly ImportItemDto[]): Selection => new Set(items.filter((item) => item.included).map((item) => item.id))

export const toggleItem = (selection: Selection, id: string, include: boolean): Selection => {
  const next = new Set(selection)
  if (include) next.add(id)
  else next.delete(id)
  return next
}

/** Pure: every item of one confidence in or out, the others as they were. */
export const setByConfidence = (selection: Selection, items: readonly ImportItemDto[], confidence: Confidence, include: boolean): Selection =>
  items.filter((item) => item.confidence === confidence).reduce((acc, item) => toggleItem(acc, item.id, include), selection)

/** Pure: body of `PUT /imports/:id/items`, only the items whose choice differs from the api. */
export const selectionChanges = (items: readonly ImportItemDto[], selection: Selection): ItemsInput => ({
  items: items.filter((item) => item.included !== selection.has(item.id)).map((item) => ({ itemId: item.id, included: selection.has(item.id) })),
})

const matchesProblem = (item: ImportItemDto, selection: Selection, problem: ProblemFilter): boolean => {
  if (problem === 'all') return true
  if (problem === 'merged') return item.existing !== null
  if (problem === 'excluded') return !selection.has(item.id)
  return itemProblems(item).includes(problem)
}

export const filterItems = (items: readonly ImportItemDto[], selection: Selection, filters: PreviewFilters): readonly ImportItemDto[] =>
  items.filter((item) => (filters.confidence === 'all' || item.confidence === filters.confidence) && matchesProblem(item, selection, filters.problem))

export const confidenceCounts = (items: readonly ImportItemDto[]): Readonly<Record<Confidence, number>> =>
  items.reduce<Record<Confidence, number>>((acc, item) => ({ ...acc, [item.confidence]: acc[item.confidence] + 1 }), { high: 0, medium: 0, low: 0 })

export interface PreviewSummary {
  readonly created: number
  readonly merged: number
  readonly excluded: number
  /** Included without an email: no reconfirmation request, erased after the reconfirmation window. */
  readonly noEmail: number
  readonly total: number
}

export const previewSummary = (items: readonly ImportItemDto[], selection: Selection): PreviewSummary => {
  const included = items.filter((item) => selection.has(item.id))
  return {
    created: included.filter((item) => item.existing === null).length,
    merged: included.filter((item) => item.existing !== null).length,
    excluded: items.length - included.length,
    noEmail: included.filter(hasNoEmail).length,
    total: items.length,
  }
}
