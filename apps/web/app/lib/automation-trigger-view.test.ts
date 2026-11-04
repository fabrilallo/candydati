import { describe, expect, it } from 'vitest'
import { rule } from '~~/test/fixtures/phase4-fixtures'
import { conditionParts, describeTrigger, EMPTY_TRIGGER_FORM, parseTags, toggleIn, triggerToForm, validateTriggerForm } from './automation-trigger-view'

describe('automation triggers and conditions view', () => {
  it('reads a rule into the form, with empty conditions and default days', () => {
    expect(triggerToForm(rule('r1'))).toEqual(EMPTY_TRIGGER_FORM)
    expect(triggerToForm(rule('r1', { trigger: { type: 'stage_stuck', days: 7 }, conditions: { sources: ['manual'], tags: ['senior', 'java'], consentScopes: ['talent_pool'] } }))).toEqual({
      trigger: 'stage_stuck',
      triggerDays: '7',
      sources: ['manual'],
      consentScopes: ['talent_pool'],
      tags: 'senior, java',
    })
    expect(triggerToForm(rule('r1', { trigger: { type: 'response_due_soon', daysBefore: 1 } })).triggerDays).toBe('1')
  })

  it('builds the trigger and the conditions to send, only the ones set', () => {
    expect(validateTriggerForm(EMPTY_TRIGGER_FORM)).toEqual({ errors: {}, value: { trigger: { type: 'stage_entered' }, conditions: {} } })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'stage_stuck', triggerDays: '5', sources: ['careers_page'], tags: 'Senior,  senior, remote,' })).toEqual({
      errors: {},
      value: { trigger: { type: 'stage_stuck', days: 5 }, conditions: { sources: ['careers_page'], tags: ['senior', 'remote'] } },
    })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'response_due_soon', triggerDays: '2', consentScopes: ['talent_pool'] }).value).toEqual({
      trigger: { type: 'response_due_soon', daysBefore: 2 },
      conditions: { consentScopes: ['talent_pool'] },
    })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'candidate_replied', triggerDays: 'x' }).value?.trigger).toEqual({ type: 'candidate_replied' })
  })

  it('refuses days out of range and too many or too long tags', () => {
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'stage_stuck', triggerDays: '0' }).errors).toEqual({ triggerDays: 'automations.errors.stuckDays' })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'response_due_soon', triggerDays: '15' }).errors).toEqual({ triggerDays: 'automations.errors.dueSoonDays' })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') }).errors).toEqual({ tags: 'automations.errors.tags' })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, tags: 'x'.repeat(41) }).errors).toEqual({ tags: 'automations.errors.tags' })
    expect(validateTriggerForm({ ...EMPTY_TRIGGER_FORM, trigger: 'stage_stuck', triggerDays: '3' }).value).not.toBeNull()
  })

  it('describes a trigger as a translation key and its count', () => {
    expect(describeTrigger({ type: 'stage_entered' })).toEqual({ key: 'automations.trigger.stage_entered', params: {} })
    expect(describeTrigger({ type: 'stage_stuck', days: 3 })).toEqual({ key: 'automations.trigger.stage_stuck', params: { count: 3 } })
    expect(describeTrigger({ type: 'response_due_soon', daysBefore: 1 })).toEqual({ key: 'automations.trigger.response_due_soon', params: { count: 1 } })
  })

  it('lists the conditions of a rule, nothing without them', () => {
    expect(conditionParts({})).toEqual([])
    expect(conditionParts({ sources: ['manual', 'import'], tags: ['senior'], consentScopes: ['talent_pool'] })).toEqual([
      { kind: 'sources', values: ['manual', 'import'] },
      { kind: 'tags', values: ['senior'] },
      { kind: 'consentScopes', values: ['talent_pool'] },
    ])
  })

  it('parses tags like the profile and toggles a checkbox value in canonical order', () => {
    expect(parseTags(' A, b ,a,, ')).toEqual(['a', 'b'])
    expect(toggleIn(['manual'], 'careers_page', ['careers_page', 'manual', 'import'])).toEqual(['careers_page', 'manual'])
    expect(toggleIn(['careers_page', 'manual'], 'manual', ['careers_page', 'manual', 'import'])).toEqual(['careers_page'])
  })
})
