import { CRITERION_LABEL_MAX, SCORECARD_CRITERIA_MAX, type JobScorecardDto } from '@candydati/domain'

/**
 * The scorecard editor of a job (PRODUCT.md §2.4): an ordered list of criteria, each for every stage or for one. There
 * is no weight and no number. A `locked` criterion was used by a feedback: its words are fixed, it can only be retired.
 */
export interface CriterionDraft {
  /** Stable key for the list: the id for saved criteria, a local one for new rows. */
  readonly key: string
  /** null for a criterion not saved yet. */
  readonly id: string | null
  readonly label: string
  /** null: asked at every stage. */
  readonly stageId: string | null
  readonly locked: boolean
}

export type CriterionError = 'label_required' | 'label_too_long' | 'duplicate'

export interface CriteriaCheck {
  readonly ok: boolean
  readonly errors: Readonly<Record<string, CriterionError>>
}

/** Body of `PUT /jobs/:id/scorecard`: the whole list in order, ids only for criteria that already exist. */
export interface ScorecardBody {
  readonly criteria: readonly { readonly id?: string; readonly label: string; readonly stageId: string | null }[]
}

export const criteriaDrafts = (scorecard: JobScorecardDto): readonly CriterionDraft[] =>
  scorecard.criteria
    .toSorted((a, b) => a.position - b.position)
    .map((criterion) => ({ key: criterion.id, id: criterion.id, label: criterion.label, stageId: criterion.stageId, locked: criterion.locked }))

export const newCriterion = (key: string, label = '', stageId: string | null = null): CriterionDraft => ({ key, id: null, label, stageId, locked: false })

export const scorecardBody = (drafts: readonly CriterionDraft[]): ScorecardBody => ({
  criteria: drafts.map((draft) => ({ ...(draft.id ? { id: draft.id } : {}), label: draft.label.trim(), stageId: draft.stageId })),
})

const normal = (label: string): string => label.trim().toLocaleLowerCase()

const errorOf = (draft: CriterionDraft, earlier: readonly CriterionDraft[]): CriterionError | null => {
  const label = draft.label.trim()
  if (label === '') return 'label_required'
  if (label.length > CRITERION_LABEL_MAX) return 'label_too_long'
  return earlier.some((other) => normal(other.label) === normal(label) && other.stageId === draft.stageId) ? 'duplicate' : null
}

/** Every label written, within the limit, and not repeated for the same stage (the later copy is flagged). */
export const checkCriteria = (drafts: readonly CriterionDraft[]): CriteriaCheck => {
  const errors = Object.fromEntries(
    drafts.flatMap((draft, index) => {
      const error = errorOf(draft, drafts.slice(0, index))
      return error ? [[draft.key, error] as const] : []
    }),
  )
  return { ok: Object.keys(errors).length === 0, errors }
}

/** The list with the proposed labels it does not have yet, for every stage, up to the limit. */
export const addLabels = (drafts: readonly CriterionDraft[], labels: readonly string[], makeKey: () => string): readonly CriterionDraft[] => {
  const fresh = labels
    .map((label) => label.trim())
    .filter((label, index, all) => label !== '' && all.findIndex((other) => normal(other) === normal(label)) === index)
    .filter((label) => !drafts.some((draft) => normal(draft.label) === normal(label)))
    .slice(0, Math.max(0, SCORECARD_CRITERIA_MAX - drafts.length))
  return fresh.length === 0 ? drafts : [...drafts, ...fresh.map((label) => newCriterion(makeKey(), label))]
}
