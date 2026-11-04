import { EVIDENCE_MAX, type Observation, type ObservationInput } from '@candydati/domain'

/**
 * The scorecard part of the public feedback form (PRODUCT.md §2.4): for each criterion one of three words and the
 * evidence behind it. No number, no scale, no total.
 */
export interface ObservationDraft {
  readonly observation: Observation | null
  readonly evidence: string
}

export type ObservationError = 'observation_required' | 'evidence_required' | 'evidence_too_long'

export interface ObservationsCheck {
  readonly ok: boolean
  /** By criterion id; criteria without problems are absent. */
  readonly errors: Readonly<Record<string, readonly ObservationError[]>>
}

type Criterion = { readonly id: string }
type Drafts = Readonly<Record<string, ObservationDraft>>

export const EMPTY_OBSERVATION: ObservationDraft = { observation: null, evidence: '' }

const errorsOf = (draft: ObservationDraft): readonly ObservationError[] => {
  const evidence = draft.evidence.trim()
  return [
    ...(draft.observation === null ? (['observation_required'] as const) : []),
    ...(evidence === '' ? (['evidence_required'] as const) : []),
    ...(evidence.length > EVIDENCE_MAX ? (['evidence_too_long'] as const) : []),
  ]
}

/** Every criterion has a word and evidence within the limit (the api refuses the form otherwise). */
export const checkObservations = (criteria: readonly Criterion[], drafts: Drafts): ObservationsCheck => {
  const errors = Object.fromEntries(
    criteria.flatMap((criterion) => {
      const found = errorsOf(drafts[criterion.id] ?? EMPTY_OBSERVATION)
      return found.length > 0 ? [[criterion.id, found] as const] : []
    }),
  )
  return { ok: Object.keys(errors).length === 0, errors }
}

/** The `observations` sent: one per criterion in the order shown. Call after `checkObservations` passed. */
export const observationsBody = (criteria: readonly Criterion[], drafts: Drafts): readonly ObservationInput[] =>
  criteria.flatMap((criterion) => {
    const draft = drafts[criterion.id]
    return draft?.observation ? [{ criterionId: criterion.id, observation: draft.observation, evidence: draft.evidence.trim() }] : []
  })
