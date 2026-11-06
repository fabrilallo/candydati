import { describe, expect, it } from 'vitest'
import type { AttachPackResultDto, AutomationPackRuleDto } from '@candydati/domain'
import { anchorLabelKey, anchorOptions, attachToast, packRuleToForm, rulesByAnchor, validatePackRuleForm } from './automation-pack-view'
import { EMPTY_RULE_FORM } from './automation-view'

const rule = (id: string, overrides: Partial<AutomationPackRuleDto> = {}): AutomationPackRuleDto => ({
  id, packId: 'p1', stage: 'technical_interview', trigger: { type: 'stage_entered' }, conditions: {}, action: { type: 'request_feedback' },
  enabled: true, createdBy: 'u1', createdAt: '2026-11-01T00:00:00.000Z', ...overrides,
})

describe('automation pack view', () => {
  it('names an anchor like the board names a stage', () => {
    expect(anchorLabelKey('received')).toBe('pipeline.received')
    expect(anchorLabelKey('technical_interview')).toBe('taxonomy.stageTypes.technical_interview')
  })

  it('offers every anchor, and for a proposed move every stage type except the rule own and received', () => {
    expect(anchorOptions(null)[0]).toBe('received')
    expect(anchorOptions('hr_interview')).not.toContain('received')
    expect(anchorOptions('hr_interview')).not.toContain('hr_interview')
    expect(anchorOptions('hr_interview')).toContain('offer')
  })

  it('groups rules by anchor in pipeline order, leaving out anchors without rules', () => {
    const groups = rulesByAnchor([rule('a', { stage: 'offer' }), rule('b', { stage: 'received' }), rule('c', { stage: 'offer', createdAt: '2026-10-01T00:00:00.000Z' })])
    expect(groups.map((g) => [g.anchor, g.rules.map((r) => r.id)])).toEqual([
      ['received', ['b']],
      ['offer', ['c', 'a']],
    ])
  })

  it('turns the form into the body of a pack rule, with the stage as an anchor', () => {
    const form = { ...EMPTY_RULE_FORM, type: 'add_tag' as const, tag: 'senior' }
    expect(validatePackRuleForm(form, 'received', true).input).toEqual({ stage: 'received', trigger: { type: 'stage_entered' }, conditions: {}, enabled: true, action: { type: 'add_tag', tag: 'senior' } })
    expect(validatePackRuleForm({ ...EMPTY_RULE_FORM }, '', true).errors.stage).toBe('automationPacks.errors.stageRequired')
    expect(packRuleToForm(rule('a', { action: { type: 'add_tag', tag: 'x' } })).tag).toBe('x')
  })

  it('says what an attach did in one toast', () => {
    const result = (overrides: Partial<AttachPackResultDto>): AttachPackResultDto => ({ packId: 'p1', created: [], updated: [], removed: 0, skipped: [], ...overrides })
    expect(attachToast(result({ created: ['r1', 'r2'] }))).toEqual({ key: 'automationPacks.attach.done', params: { created: 2, updated: 0, skipped: 0 } })
    expect(attachToast(result({ updated: ['r1'], skipped: [{ ruleId: 'x', reason: 'no_stage', stageId: null }] }))).toEqual({ key: 'automationPacks.attach.doneWithSkips', params: { created: 0, updated: 1, skipped: 1 } })
  })
})
