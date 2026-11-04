import { CRITERION_LABEL_MAX, SCORECARD_CRITERIA_MAX } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { addLabels, checkCriteria, criteriaDrafts, newCriterion, scorecardBody, type CriterionDraft } from './scorecard-form'

const draft = (key: string, overrides: Partial<CriterionDraft> = {}): CriterionDraft => ({ key, id: key, label: `Label ${key}`, stageId: null, locked: false, ...overrides })

describe('scorecard form', () => {
  it('reads the criteria in their order', () => {
    const drafts = criteriaDrafts({
      jobId: 'j',
      criteria: [
        { id: 'c2', label: 'English B2', stageId: 'stage-1', position: 1, locked: true },
        { id: 'c1', label: 'Postgres', stageId: null, position: 0, locked: false },
      ],
    })
    expect(drafts).toEqual([
      { key: 'c1', id: 'c1', label: 'Postgres', stageId: null, locked: false },
      { key: 'c2', id: 'c2', label: 'English B2', stageId: 'stage-1', locked: true },
    ])
  })

  it('builds the body: ids kept for existing criteria, omitted for new ones, labels trimmed', () => {
    const body = scorecardBody([draft('c1', { label: ' Postgres ' }), newCriterion('k1', 'English B2', 'stage-0')])
    expect(body).toEqual({ criteria: [{ id: 'c1', label: 'Postgres', stageId: null }, { label: 'English B2', stageId: 'stage-0' }] })
  })

  it('flags empty, too long and repeated labels', () => {
    const check = checkCriteria([draft('a', { label: ' ' }), draft('b', { label: 'x'.repeat(CRITERION_LABEL_MAX + 1) }), draft('c', { label: 'Postgres' }), draft('d', { label: 'postgres ' })])
    expect(check.ok).toBe(false)
    expect(check.errors).toEqual({ a: 'label_required', b: 'label_too_long', d: 'duplicate' })
    expect(checkCriteria([draft('a')]).ok).toBe(true)
  })

  it('adds proposed labels once, never past the limit', () => {
    let n = 0
    const key = () => `k${n++}`
    const added = addLabels([draft('c1', { label: 'Postgres' })], ['postgres', 'English B2', 'English B2'], key)
    expect(added.map((item) => item.label)).toEqual(['Postgres', 'English B2'])
    expect(added[1]).toMatchObject({ id: null, stageId: null, locked: false })
    const full = Array.from({ length: SCORECARD_CRITERIA_MAX }, (_, i) => draft(`c${i}`))
    expect(addLabels(full, ['One more'], key)).toBe(full)
  })
})
