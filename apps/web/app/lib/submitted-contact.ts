import type { CandidateCorrection, SubmittedContact } from '@candydati/domain'

type ContactField = keyof SubmittedContact

export interface ContactChange {
  readonly field: ContactField
  readonly current: string | null
  readonly submitted: string
}

const FIELDS: readonly ContactField[] = ['firstName', 'lastName', 'phone', 'linkedinUrl']
const same = (a: string | null, b: string): boolean => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()

/**
 * What a public application typed that differs from the profile. A submission never rewrites the profile (anyone can type
 * someone's email), so the recruiter sees the difference and decides. A field left empty is not a difference.
 */
export const contactChanges = (candidate: Readonly<Record<ContactField, string | null>>, submitted: SubmittedContact | null | undefined): readonly ContactChange[] => {
  if (!submitted) return []
  return FIELDS.flatMap((field) => {
    const value = submitted[field]
    return value !== null && value.trim() !== '' && !same(candidate[field], value) ? [{ field, current: candidate[field], submitted: value.trim() }] : []
  })
}

/** The correction (GDPR art. 16 flow, audited) that applies the chosen changes to the profile. */
export const correctionOf = (changes: readonly ContactChange[]): CandidateCorrection =>
  Object.fromEntries(changes.map((change) => [change.field, change.submitted])) as CandidateCorrection
