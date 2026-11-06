import { describe, expect, it } from 'vitest'
import type { AddSourcedResultDto } from '@candydati/domain'
import { addOutcomeToast, daysLeft, evidenceToLines, parseEvidence, validateContactForm } from './sourcing-view'

describe('sourcing view', () => {
  it('counts whole days left before the automatic erasure, never below zero', () => {
    const now = new Date('2026-11-06T10:00:00Z')
    expect(daysLeft('2026-12-06T10:00:00.000Z', now)).toBe(30)
    expect(daysLeft('2026-12-06T10:00:05.000Z', now)).toBe(30)
    expect(daysLeft('2026-11-06T22:00:00.000Z', now)).toBe(1)
    expect(daysLeft('2026-11-01T00:00:00.000Z', now)).toBe(0)
  })

  it('reads evidence as one "criterion: what the profile says" per line, and writes it back', () => {
    expect(parseEvidence('Go: 4 anni in Spotify\n\n Kubernetes : certificato CKA \nsenza criterio')).toEqual([
      { criterion: 'Go', text: '4 anni in Spotify' },
      { criterion: 'Kubernetes', text: 'certificato CKA' },
      { criterion: 'Note', text: 'senza criterio' },
    ])
    expect(evidenceToLines([{ criterion: 'Go', text: '4 anni', where: null }])).toBe('Go: 4 anni')
  })

  it('validates the form and builds the body of one contact', () => {
    const empty = { firstName: '', lastName: '', headline: '', location: '', source: 'linkedin' as const, profileUrl: '', evidence: '' }
    expect(validateContactForm(empty).errors).toEqual({ firstName: 'sourcing.errors.firstName', profileUrl: 'sourcing.errors.profileUrl' })
    const result = validateContactForm({ ...empty, firstName: ' Maja ', profileUrl: 'https://www.linkedin.com/in/maja', evidence: 'Go: 4 anni' })
    expect(result.input).toEqual({ firstName: 'Maja', lastName: null, headline: null, location: null, source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja', evidence: [{ criterion: 'Go', text: '4 anni' }] })
    expect(validateContactForm({ ...empty, firstName: 'Maja', profileUrl: 'javascript:alert(1)' }).errors.profileUrl).toBe('sourcing.errors.profileUrl')
  })

  it('says what happened to an added person', () => {
    const result = (outcome: AddSourcedResultDto['outcome']): AddSourcedResultDto => ({ profileUrl: 'x', outcome, contactId: null, candidateId: null, noticeUrl: null })
    expect(addOutcomeToast(result('added'))).toEqual({ kind: 'success', key: 'sourcing.outcomes.added' })
    expect(addOutcomeToast(result('already_candidate'))).toEqual({ kind: 'info', key: 'sourcing.outcomes.already_candidate' })
    expect(addOutcomeToast(result('objected'))).toEqual({ kind: 'info', key: 'sourcing.outcomes.objected' })
  })
})
