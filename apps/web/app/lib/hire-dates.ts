import { checkHireDates, hireDateSchema, type HireDatesInput } from '@candydati/domain'

/** What the two date inputs hold: `YYYY-MM-DD`, or '' when empty. */
export interface HireDraft {
  readonly offerAcceptedOn: string
  readonly startOn: string
}

export const EMPTY_HIRE_DRAFT: HireDraft = { offerAcceptedOn: '', startOn: '' }

export const hireDraftOf = (dates: { readonly offerAcceptedOn: string | null; readonly startOn: string | null }): HireDraft => ({
  offerAcceptedOn: dates.offerAcceptedOn ?? '',
  startOn: dates.startOn ?? '',
})

const KEYS = {
  invalid: 'candidate.hireDates.invalid',
  offer_before_application: 'candidate.hireDates.offerBeforeApplication',
  start_before_offer: 'candidate.hireDates.startBeforeOffer',
  start_before_application: 'candidate.hireDates.startBeforeApplication',
} as const

/** The i18n key of what is wrong with the dates (the same rules as the api), or null when they are fine. */
export const hireDatesProblemKey = (appliedAtIso: string, draft: HireDraft): string | null => {
  const filled = [draft.offerAcceptedOn, draft.startOn].filter((value) => value !== '')
  if (filled.some((value) => !hireDateSchema.safeParse(value).success)) return KEYS.invalid
  const issue = checkHireDates(new Date(appliedAtIso), {
    offerAcceptedOn: draft.offerAcceptedOn === '' ? null : draft.offerAcceptedOn,
    startOn: draft.startOn === '' ? null : draft.startOn,
  })
  return issue === null ? null : KEYS[issue]
}

/** The request body: filled dates only; with `clearEmpty` an emptied input becomes null (an edit that removes the date). */
export const hireDatesBody = (draft: HireDraft, clearEmpty = false): HireDatesInput => {
  const value = (text: string): string | null | undefined => (text !== '' ? text : clearEmpty ? null : undefined)
  const offerAcceptedOn = value(draft.offerAcceptedOn)
  const startOn = value(draft.startOn)
  return {
    ...(offerAcceptedOn === undefined ? {} : { offerAcceptedOn }),
    ...(startOn === undefined ? {} : { startOn }),
  }
}
