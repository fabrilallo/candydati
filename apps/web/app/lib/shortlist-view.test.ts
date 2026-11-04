import { SHORTLIST_CANDIDATES_MAX, SHORTLIST_MESSAGE_MAX } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import {
  checkDraft,
  confirmLines,
  draftBody,
  emptyDraft,
  noteExcerpt,
  presentableCandidates,
  setShareCv,
  shareableNotes,
  shortlistErrorKey,
  shortlistIssues,
  shortlistStatusTone,
  toggleCandidate,
  toggleNote,
} from './shortlist-view'

const card = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  outcome: null,
  consentStatus: 'given',
  hasCv: true,
  candidate: { id: `p-${id}`, firstName: 'Giulia', lastName: id.toUpperCase() },
  ...overrides,
})
const note = (id: string, applicationId: string | null) => ({ id, applicationId, body: `nota ${id}`, createdAt: '2026-10-13T10:00:00.000Z', author: { id: 'u1', name: 'Ada', external: false } })
const failure = (status: number, code: string | null) => new ApiFailure('x', { status, code, message: null, issues: [] })

describe('presentableCandidates', () => {
  it('keeps open applications with consent given, by name', () => {
    const cards = [card('b'), card('a'), card('closed', { outcome: 'hired' }), card('renew', { consentStatus: 'to_renew' })]
    expect(presentableCandidates(cards as never)).toEqual([
      { applicationId: 'a', candidateId: 'p-a', name: 'Giulia A', hasCv: true },
      { applicationId: 'b', candidateId: 'p-b', name: 'Giulia B', hasCv: true },
    ])
  })
})

describe('shareableNotes', () => {
  it('offers notes on this application or on the person, never on another application', () => {
    const notes = [note('n1', 'a1'), note('n2', null), note('n3', 'a2')]
    expect(shareableNotes(notes as never, 'a1').map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('cuts long notes for the excerpt', () => {
    expect(noteExcerpt('  breve  ')).toBe('breve')
    expect(noteExcerpt('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('draft', () => {
  it('adds and removes candidates, up to the limit, without touching the input', () => {
    const start = emptyDraft()
    const one = toggleCandidate(start, 'a1')
    expect(start.candidates).toEqual([])
    expect(one.candidates).toEqual([{ applicationId: 'a1', shareCv: false, noteIds: [] }])
    expect(toggleCandidate(one, 'a1').candidates).toEqual([])
    const full = Array.from({ length: SHORTLIST_CANDIDATES_MAX }, (_, i) => `a${i}`).reduce(toggleCandidate, start)
    expect(toggleCandidate(full, 'extra').candidates).toHaveLength(SHORTLIST_CANDIDATES_MAX)
  })

  it('shares the CV and up to five notes per candidate', () => {
    const draft = setShareCv(toggleCandidate(emptyDraft(), 'a1'), 'a1', true)
    expect(draft.candidates[0]?.shareCv).toBe(true)
    const notes = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].reduce((current, id) => toggleNote(current, 'a1', id), draft)
    expect(notes.candidates[0]?.noteIds).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
    expect(toggleNote(notes, 'a1', 'n2').candidates[0]?.noteIds).toEqual(['n1', 'n3', 'n4', 'n5'])
  })

  it('checks the contact, the candidates and the message', () => {
    expect(checkDraft(emptyDraft())).toEqual(['shortlists.compose.errors.contact', 'shortlists.compose.errors.candidates'])
    const ready = { ...toggleCandidate(emptyDraft(), 'a1'), contactId: 'k1' }
    expect(checkDraft(ready)).toEqual([])
    expect(checkDraft({ ...ready, message: 'x'.repeat(SHORTLIST_MESSAGE_MAX + 1) })).toEqual(['shortlists.compose.errors.message'])
  })

  it('builds the body, without an empty message', () => {
    const draft = { ...setShareCv(toggleCandidate(emptyDraft(), 'a1'), 'a1', true), contactId: 'k1', message: '  ' }
    expect(draftBody(draft)).toEqual({ contactId: 'k1', candidates: [{ applicationId: 'a1', shareCv: true, noteIds: [] }] })
    expect(draftBody({ ...draft, message: ' Ciao ' })).toMatchObject({ message: 'Ciao' })
  })
})

describe('confirmLines', () => {
  it('names each chosen candidate with what goes out, in the order sent', () => {
    const candidates = presentableCandidates([card('a'), card('b')] as never)
    const draft = toggleNote(setShareCv(toggleCandidate(toggleCandidate(emptyDraft(), 'b'), 'a'), 'b', true), 'b', 'n1')
    expect(confirmLines(draft, candidates)).toEqual([
      { applicationId: 'b', name: 'Giulia B', shareCv: true, noteCount: 1 },
      { applicationId: 'a', name: 'Giulia A', shareCv: false, noteCount: 0 },
    ])
  })
})

describe('errors', () => {
  it('names each refused candidate with the reason', () => {
    const names = ['Giulia Rossi', 'Marco Bianchi']
    expect(
      shortlistIssues(
        [
          { path: 'candidates.1.shareCv', message: 'no_cv' },
          { path: 'candidates.0.applicationId', message: 'not_presentable' },
          { path: 'candidates.0.noteIds', message: 'unknown_note' },
          { path: 'contactId', message: 'unknown_contact' },
          { path: 'weird', message: 'x' },
        ],
        names,
      ),
    ).toEqual([
      { key: 'shortlists.compose.issues.no_cv', name: 'Marco Bianchi' },
      { key: 'shortlists.compose.issues.not_presentable', name: 'Giulia Rossi' },
      { key: 'shortlists.compose.issues.unknown_note', name: 'Giulia Rossi' },
      { key: 'shortlists.compose.issues.unknown_contact', name: '' },
      { key: 'shortlists.compose.issues.other', name: '' },
    ])
  })

  it('names the refusals of the whole shortlist', () => {
    for (const code of ['job_without_client', 'client_archived', 'job_closed', 'clients_off']) expect(shortlistErrorKey(failure(409, code))).toBe(`shortlists.errors.${code}`)
    expect(shortlistErrorKey(failure(422, 'validation_failed'))).toBe('shortlists.errors.invalid')
    expect(shortlistErrorKey(new Error('x'))).toBe('errors.generic')
  })

  it('gives each status its pill', () => {
    expect(shortlistStatusTone('open')).toBe('secondary')
    expect(shortlistStatusTone('answered')).toBe('success')
    expect(shortlistStatusTone('expired')).toBe('outline')
    expect(shortlistStatusTone('revoked')).toBe('outline')
  })
})
