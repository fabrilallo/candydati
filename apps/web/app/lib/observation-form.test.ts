import { EVIDENCE_MAX } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { checkObservations, observationsBody } from './observation-form'

const criteria = [{ id: 'c1', label: 'Postgres' }, { id: 'c2', label: 'English B2' }]

describe('observation form', () => {
  it('asks for a word and the evidence on every criterion', () => {
    const check = checkObservations(criteria, { c1: { observation: 'observed', evidence: '  ' }, c2: { observation: null, evidence: 'x'.repeat(EVIDENCE_MAX + 1) } })
    expect(check.ok).toBe(false)
    expect(check.errors).toEqual({ c1: ['evidence_required'], c2: ['observation_required', 'evidence_too_long'] })
  })

  it('passes when everything is written, with no criteria at all too', () => {
    expect(checkObservations(criteria, { c1: { observation: 'to_explore', evidence: 'Da capire' }, c2: { observation: 'not_observed', evidence: 'Non emerso' } }).ok).toBe(true)
    expect(checkObservations([], {}).ok).toBe(true)
  })

  it('builds one observation per criterion, in order, evidence trimmed', () => {
    expect(observationsBody(criteria, { c2: { observation: 'not_observed', evidence: ' Non emerso ' }, c1: { observation: 'observed', evidence: 'Query solide' } })).toEqual([
      { criterionId: 'c1', observation: 'observed', evidence: 'Query solide' },
      { criterionId: 'c2', observation: 'not_observed', evidence: 'Non emerso' },
    ])
  })
})
