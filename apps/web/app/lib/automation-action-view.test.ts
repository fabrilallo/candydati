import { describe, expect, it } from 'vitest'
import { actionToForm, describeAction, EMPTY_ACTION_FORM, validateAction, type ActionForm } from './automation-action-view'

const form = (change: Partial<ActionForm>): ActionForm => ({ ...EMPTY_ACTION_FORM, ...change })
const names = {
  template: (id: string) => (id === 't1' ? 'Aggiornamento' : null),
  member: (id: string) => (id === 'u2' ? 'Bruno' : null),
  stage: (id: string) => (id === 'tech' ? 'Colloquio tecnico' : null),
  owner: 'il responsabile',
}

describe('validateAction', () => {
  it('builds every action from its fields', () => {
    expect(validateAction(form({ type: 'add_tag', tag: ' Fast ' }), 's').action).toEqual({ type: 'add_tag', tag: 'fast' })
    expect(validateAction(form({ type: 'assign', assignee: 'u2', dueInDays: '3' }), 's').action).toEqual({ type: 'assign', assignee: 'u2', dueInDays: 3 })
    expect(validateAction(form({ type: 'request_feedback' }), 's').action).toEqual({ type: 'request_feedback' })
    expect(validateAction(form({ type: 'notify', channel: 'email', recipients: ['u2', 'u2'] }), 's').action).toEqual({ type: 'notify', channel: 'email', recipients: ['u2'] })
    expect(validateAction(form({ type: 'notify', channel: 'webhook', recipients: ['u2'] }), 's').action).toEqual({ type: 'notify', channel: 'webhook', recipients: [] })
    expect(validateAction(form({ type: 'propose_move', toStageId: 'tech' }), 's').action).toEqual({ type: 'propose_move', toStageId: 'tech' })
  })

  it('returns translation keys for what is missing or out of range', () => {
    expect(validateAction(form({ type: 'add_tag', tag: '  ' }), 's').errors).toEqual({ tag: 'automations.errors.tag' })
    expect(validateAction(form({ type: 'assign', dueInDays: '91' }), 's').errors).toEqual({ dueInDays: 'automations.errors.dueInDays' })
    expect(validateAction(form({ type: 'notify', channel: 'in_app', recipients: [] }), 's').errors).toEqual({ recipients: 'automations.errors.recipients' })
    expect(validateAction(form({ type: 'propose_move', toStageId: '' }), 's').errors).toEqual({ toStageId: 'automations.errors.toStage' })
    expect(validateAction(form({ type: 'propose_move', toStageId: 's' }), 's').errors).toEqual({ toStageId: 'automations.errors.toStage' })
    expect(validateAction(form({ type: 'create_task', title: '' }), 's').errors).toEqual({ title: 'tasks.errors.titleRequired' })
  })
})

describe('actionToForm', () => {
  it('reads every action back into the form', () => {
    expect(actionToForm({ type: 'add_tag', tag: 'x' })).toMatchObject({ type: 'add_tag', tag: 'x' })
    expect(actionToForm({ type: 'assign', assignee: 'u2', dueInDays: 1 })).toMatchObject({ type: 'assign', assignee: 'u2', dueInDays: '1' })
    expect(actionToForm({ type: 'notify', channel: 'webhook', recipients: [] })).toMatchObject({ channel: 'webhook', recipients: [] })
    expect(actionToForm({ type: 'propose_move', toStageId: 'tech' })).toMatchObject({ toStageId: 'tech' })
    expect(actionToForm({ type: 'request_feedback' })).toEqual({ ...EMPTY_ACTION_FORM, type: 'request_feedback' })
  })
})

describe('describeAction', () => {
  it('says what each action does', () => {
    expect(describeAction({ type: 'add_tag', tag: 'fast' }, names)).toEqual({ key: 'automations.rule.addTag', params: { tag: 'fast' } })
    expect(describeAction({ type: 'assign', assignee: 'job_owner' }, names)).toEqual({ key: 'automations.rule.assignForOwner', params: {} })
    expect(describeAction({ type: 'assign', assignee: 'u2', dueInDays: 2 }, names)).toEqual({ key: 'automations.rule.assignForMemberDue', params: { member: 'Bruno', count: 2 } })
    expect(describeAction({ type: 'request_feedback' }, names).key).toBe('automations.rule.requestFeedback')
    expect(describeAction({ type: 'notify', channel: 'in_app', recipients: ['job_owner', 'u2'] }, names)).toEqual({ key: 'automations.rule.notify_in_app', params: { people: 'il responsabile, Bruno' } })
    expect(describeAction({ type: 'notify', channel: 'webhook', recipients: [] }, names).key).toBe('automations.rule.notifyWebhook')
    expect(describeAction({ type: 'propose_move', toStageId: 'tech' }, names)).toEqual({ key: 'automations.rule.proposeMove', params: { stage: 'Colloquio tecnico' } })
    expect(describeAction({ type: 'propose_move', toStageId: 'gone' }, names).params).toEqual({ stage: '?' })
  })
})
