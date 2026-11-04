import { SHORTLIST_REASON_MAX, SHORTLIST_REASON_MIN, type ClientAnswer, type PublicShortlistCandidateDto } from '@candydati/domain'
import { ApiFailure } from './api-call'

/** The client's side of a shortlist (PRODUCT.md §3.5), as pure functions. */
export type AnswerIssue = 'choice' | 'reason'

/** Pure: what is missing before an answer can go (the same limits as the api). */
export const checkAnswer = (choice: ClientAnswer | null, reason: string): readonly AnswerIssue[] => {
  const length = reason.trim().length
  return [...(choice === null ? (['choice'] as const) : []), ...(length < SHORTLIST_REASON_MIN || length > SHORTLIST_REASON_MAX ? (['reason'] as const) : [])]
}

export type AnswerFailure = 'invalid' | 'alreadyAnswered' | 'reason' | 'unavailable'

/** Pure: why an answer was refused. `invalid` = the link stopped working (expired or revoked meanwhile). */
export const answerFailure = (error: unknown): AnswerFailure => {
  if (!(error instanceof ApiFailure)) return 'unavailable'
  const { status } = error.failure
  if (status === 404 || status === 410) return 'invalid'
  if (status === 409) return 'alreadyAnswered'
  if (status === 422 || status === 400) return 'reason'
  return 'unavailable'
}

export const replaceCandidate = (candidates: readonly PublicShortlistCandidateDto[], next: PublicShortlistCandidateDto): readonly PublicShortlistCandidateDto[] =>
  candidates.map((candidate) => (candidate.itemId === next.itemId ? next : candidate))

export const answeredCount = (candidates: readonly PublicShortlistCandidateDto[]): number => candidates.filter((candidate) => candidate.answer !== null).length
