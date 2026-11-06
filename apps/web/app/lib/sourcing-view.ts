import { normalizeProfileUrl, type AddSourcedResultDto, type SourcedContactInput, type SourcingEvidence, type SourcingSource } from '@candydati/domain'

const DAY_MS = 86_400_000

/** Pure: days before the contact is erased, to the nearest day (a clock a few seconds old must not show 31), never below zero. */
export const daysLeft = (expiresAt: string, now: Date): number => Math.max(0, Math.round((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS))

const FALLBACK_CRITERION = 'Note'

/** Pure: one "criterion: what the profile says" per line; a line without a colon goes under a generic criterion. */
export const parseEvidence = (text: string): readonly { readonly criterion: string; readonly text: string }[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const colon = line.indexOf(':')
      if (colon <= 0) return { criterion: FALLBACK_CRITERION, text: line }
      return { criterion: line.slice(0, colon).trim(), text: line.slice(colon + 1).trim() }
    })
    .filter((item) => item.text !== '')

export const evidenceToLines = (evidence: readonly SourcingEvidence[]): string => evidence.map((item) => `${item.criterion}: ${item.text}`).join('\n')

export interface ContactForm {
  readonly firstName: string
  readonly lastName: string
  readonly headline: string
  readonly location: string
  readonly source: SourcingSource
  readonly profileUrl: string
  readonly evidence: string
}

export type ContactFormErrors = Partial<Record<keyof ContactForm, string>>

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

/** Pure: errors as translation keys, or the body of one contact. */
export const validateContactForm = (form: ContactForm): { readonly errors: ContactFormErrors; readonly input: SourcedContactInput | null } => {
  const errors: ContactFormErrors = {
    ...(form.firstName.trim() === '' ? { firstName: 'sourcing.errors.firstName' } : {}),
    ...(normalizeProfileUrl(form.profileUrl) === null ? { profileUrl: 'sourcing.errors.profileUrl' } : {}),
  }
  if (Object.keys(errors).length > 0) return { errors, input: null }
  return {
    errors,
    input: {
      firstName: form.firstName.trim(),
      lastName: orNull(form.lastName),
      headline: orNull(form.headline),
      location: orNull(form.location),
      source: form.source,
      profileUrl: form.profileUrl.trim(),
      evidence: [...parseEvidence(form.evidence)],
    },
  }
}

/** Pure: the toast after adding one person. */
export const addOutcomeToast = (result: AddSourcedResultDto): { readonly kind: 'success' | 'info'; readonly key: string } => ({
  kind: result.outcome === 'added' ? 'success' : 'info',
  key: `sourcing.outcomes.${result.outcome}`,
})
