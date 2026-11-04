import {
  SHORTLIST_CANDIDATES_MAX,
  SHORTLIST_MESSAGE_MAX,
  SHORTLIST_NOTES_PER_CANDIDATE_MAX,
  type ApplicationCardDto,
  type NoteDto,
  type ShortlistDto,
} from '@candydati/domain'
import { ApiFailure } from './api-call'
import { errorKeyOf } from './auth-errors'
import type { ShortlistBody } from './client-api'

/** The shortlist composer and the list of sent shortlists (PRODUCT.md §3.5), as pure functions. */
export interface PresentableCandidate {
  readonly applicationId: string
  readonly candidateId: string
  readonly name: string
  readonly hasCv: boolean
}

type Card = Pick<ApplicationCardDto, 'id' | 'outcome' | 'consentStatus' | 'hasCv'> & { readonly candidate: Pick<ApplicationCardDto['candidate'], 'id' | 'firstName' | 'lastName'> }

/** Pure: who can be presented, as the api checks it: an open application of the job with consent given. */
export const presentableCandidates = (cards: readonly Card[]): readonly PresentableCandidate[] =>
  cards
    .filter((card) => card.outcome === null && card.consentStatus === 'given')
    .map((card) => ({ applicationId: card.id, candidateId: card.candidate.id, name: `${card.candidate.firstName} ${card.candidate.lastName}`.trim(), hasCv: card.hasCv }))
    .toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

/** Pure: a note may go out only when it is about this application or about the person in general. */
export const shareableNotes = (notes: readonly NoteDto[], applicationId: string): readonly NoteDto[] =>
  notes.filter((note) => note.applicationId === null || note.applicationId === applicationId)

const EXCERPT_MAX = 160
export const noteExcerpt = (body: string, max: number = EXCERPT_MAX): string => {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

export interface CandidateChoice {
  readonly applicationId: string
  readonly shareCv: boolean
  readonly noteIds: readonly string[]
}

export interface ShortlistDraft {
  readonly contactId: string | null
  readonly message: string
  readonly candidates: readonly CandidateChoice[]
}

export const emptyDraft = (): ShortlistDraft => ({ contactId: null, message: '', candidates: [] })

export const toggleCandidate = (draft: ShortlistDraft, applicationId: string): ShortlistDraft => {
  if (draft.candidates.some((choice) => choice.applicationId === applicationId)) {
    return { ...draft, candidates: draft.candidates.filter((choice) => choice.applicationId !== applicationId) }
  }
  if (draft.candidates.length >= SHORTLIST_CANDIDATES_MAX) return draft
  return { ...draft, candidates: [...draft.candidates, { applicationId, shareCv: false, noteIds: [] }] }
}

const patchChoice = (draft: ShortlistDraft, applicationId: string, patch: (choice: CandidateChoice) => CandidateChoice): ShortlistDraft => ({
  ...draft,
  candidates: draft.candidates.map((choice) => (choice.applicationId === applicationId ? patch(choice) : choice)),
})

export const setShareCv = (draft: ShortlistDraft, applicationId: string, shareCv: boolean): ShortlistDraft => patchChoice(draft, applicationId, (choice) => ({ ...choice, shareCv }))

export const toggleNote = (draft: ShortlistDraft, applicationId: string, noteId: string): ShortlistDraft =>
  patchChoice(draft, applicationId, (choice) => {
    if (choice.noteIds.includes(noteId)) return { ...choice, noteIds: choice.noteIds.filter((id) => id !== noteId) }
    return choice.noteIds.length >= SHORTLIST_NOTES_PER_CANDIDATE_MAX ? choice : { ...choice, noteIds: [...choice.noteIds, noteId] }
  })

/** Pure: what stops the draft from going to the confirm step, as translation keys. */
export const checkDraft = (draft: ShortlistDraft): readonly string[] => [
  ...(draft.contactId === null ? ['shortlists.compose.errors.contact'] : []),
  ...(draft.candidates.length === 0 ? ['shortlists.compose.errors.candidates'] : []),
  ...(draft.message.trim().length > SHORTLIST_MESSAGE_MAX ? ['shortlists.compose.errors.message'] : []),
]

export const draftBody = (draft: ShortlistDraft): ShortlistBody => {
  const message = draft.message.trim()
  return {
    contactId: draft.contactId ?? '',
    ...(message === '' ? {} : { message }),
    candidates: draft.candidates.map((choice) => ({ applicationId: choice.applicationId, shareCv: choice.shareCv, noteIds: [...choice.noteIds] })),
  }
}

/** One line of the confirm step: what the client will see of a candidate. */
export interface ConfirmLine {
  readonly applicationId: string
  readonly name: string
  readonly shareCv: boolean
  readonly noteCount: number
}

/** Pure: the chosen candidates in the order they will be sent, with their names. */
export const confirmLines = (draft: ShortlistDraft, candidates: readonly PresentableCandidate[]): readonly ConfirmLine[] =>
  draft.candidates.map((choice) => ({
    applicationId: choice.applicationId,
    name: candidates.find((candidate) => candidate.applicationId === choice.applicationId)?.name ?? '',
    shareCv: choice.shareCv,
    noteCount: choice.noteIds.length,
  }))

const ISSUE_MESSAGES = ['not_presentable', 'no_cv', 'unknown_note', 'unknown_contact'] as const

export interface ShortlistIssue {
  readonly key: string
  /** The candidate the issue is about, empty when it is about the whole shortlist. */
  readonly name: string
}

/** Pure: the api's 422 issues as sentences naming the candidate (`names` in the order they were sent). */
export const shortlistIssues = (issues: readonly { readonly path: string; readonly message: string }[], names: readonly string[]): readonly ShortlistIssue[] =>
  issues.map((issue) => {
    const [head, index] = issue.path.split('.')
    const name = head === 'candidates' && index !== undefined ? (names[Number(index)] ?? '') : ''
    const known = (ISSUE_MESSAGES as readonly string[]).includes(issue.message)
    return { key: `shortlists.compose.issues.${known ? issue.message : 'other'}`, name }
  })

const REFUSALS = ['job_without_client', 'client_archived', 'job_closed', 'clients_off'] as const

/** Pure: the message for a refused send or revoke. */
export const shortlistErrorKey = (error: unknown): string => {
  if (error instanceof ApiFailure) {
    const { code, status } = error.failure
    if (code && (REFUSALS as readonly string[]).includes(code)) return `shortlists.errors.${code}`
    if (status === 422) return 'shortlists.errors.invalid'
  }
  return errorKeyOf(error)
}

export type ShortlistTone = 'secondary' | 'success' | 'outline'

export const shortlistStatusTone = (status: ShortlistDto['status']): ShortlistTone => (status === 'open' ? 'secondary' : status === 'answered' ? 'success' : 'outline')
