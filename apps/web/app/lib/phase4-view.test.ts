import { describe, expect, it } from 'vitest'
import { notification, rule, task, taskAction } from '~~/test/fixtures/phase4-fixtures'
import { deliveryTone, describeRule, EMPTY_RULE_FORM, ruleToForm, rulesByStage, toggleEvent, validateRuleForm, validateWebhookForm } from './automation-view'
import { dueDateToIso, groupTasks, notificationContext, notificationKey, notificationLink, notificationText, replaceTask, taskGroup, unreadLabel, validateTaskForm } from './inbox-view'

const TZ = 'Europe/Rome'
const NOW = new Date('2026-10-13T10:00:00.000Z')

describe('notifications view', () => {
  it('words known kinds and falls back for new ones', () => {
    expect(notificationKey('task_assigned')).toBe('notifications.kinds.task_assigned')
    expect(notificationKey('something_new')).toBe('notifications.kinds.generic')
  })

  it('links to the candidate, the board, or my tasks', () => {
    expect(notificationLink(notification('n1'))).toBe('/app/candidates/c1?application=a1')
    expect(notificationLink(notification('n1', { candidate: null, payload: { candidateId: 'c7' } }))).toBe('/app/candidates/c7?application=a1')
    expect(notificationLink(notification('n1', { candidate: null }))).toBe('/app/jobs/j1/candidates')
    expect(notificationLink(notification('n1', { kind: 'task_due', taskId: 't1' }))).toBe('/app/tasks')
    expect(notificationLink(notification('n1', { kind: 'automation_failed', applicationId: null, taskId: 't1', jobId: null, payload: {} }))).toBe('/app/tasks')
    expect(notificationLink(notification('n1', { applicationId: null, jobId: null, payload: { jobId: 'j9' } }))).toBe('/app/jobs/j9/candidates')
    expect(notificationLink(notification('n1', { applicationId: null, jobId: null, candidate: null }))).toBeNull()
  })

  it('words a retention warning with the name and the days left, and keeps only the job as context', () => {
    const item = notification('n1', { kind: 'retention_expiring', payload: { retentionExpiresAt: '2026-10-25T08:00:00.000Z' }, candidate: { id: 'c1', firstName: 'Marta', lastName: 'Verdi' } })
    expect(notificationText(item, NOW, TZ)).toEqual({ key: 'notifications.retention.named', params: { name: 'Marta Verdi', count: 12 }, count: 12 })
    expect(notificationText({ ...item, payload: { expiresAt: '2026-10-13T20:00:00.000Z' } }, NOW, TZ).key).toBe('notifications.retention.namedToday')
    expect(notificationText({ ...item, candidate: null, payload: {} }, NOW, TZ).key).toBe('notifications.retention.anonymousSoon')
    expect(notificationContext(item)).toBe('Backend developer')
    expect(notificationText(notification('n2'), NOW, TZ)).toEqual({ key: 'notifications.kinds.response_overdue', params: {}, count: 0 })
    expect(notificationContext(notification('n2'))).toBe('Giulia Rossi, Backend developer')
  })

  it('caps the badge at 99+ and hides it at zero', () => {
    expect(unreadLabel(0)).toBeNull()
    expect(unreadLabel(5)).toBe('5')
    expect(unreadLabel(120)).toBe('99+')
  })
})

describe('tasks view', () => {
  it('groups by calendar day of the due date, earliest first', () => {
    const tasks = [
      task('later', { dueAt: '2026-10-20T16:00:00.000Z' }),
      task('none', { dueAt: null }),
      task('today', { dueAt: '2026-10-13T08:00:00.000Z' }),
      task('late', { dueAt: '2026-10-12T16:00:00.000Z' }),
      task('soon', { dueAt: '2026-10-14T16:00:00.000Z' }),
    ]
    expect(groupTasks(tasks, NOW, TZ).map(({ group, tasks: items }) => [group, items.map((item) => item.id)])).toEqual([
      ['overdue', ['late']],
      ['today', ['today']],
      ['upcoming', ['soon', 'later']],
      ['none', ['none']],
    ])
    expect(groupTasks([], NOW, TZ)).toEqual([])
    expect(taskGroup({ dueAt: null }, NOW)).toBe('none')
  })

  it('turns a picked date into the end of that working day', () => {
    const iso = dueDateToIso('2026-10-20')
    expect(iso).not.toBeNull()
    const date = new Date(iso as string)
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 20, 18])
    expect(dueDateToIso('2026-02-31')).toBeNull()
    expect(dueDateToIso('domani')).toBeNull()
  })

  it('validates a task form', () => {
    expect(validateTaskForm({ title: '  ', assigneeId: '', dueDate: 'x' }).errors).toEqual({ title: 'tasks.errors.titleRequired', assigneeId: 'tasks.errors.assigneeRequired', dueDate: 'tasks.errors.dueInvalid' })
    expect(validateTaskForm({ title: 'x'.repeat(201), assigneeId: 'u1', dueDate: '' }).errors).toEqual({ title: 'tasks.errors.titleTooLong' })
    expect(validateTaskForm({ title: ' Chiama ', assigneeId: 'u1', dueDate: '' }).value).toEqual({ title: 'Chiama', assigneeId: 'u1', dueAt: null })
  })

  it('replaces a task without touching the others', () => {
    const list = [task('t1'), task('t2')]
    const next = replaceTask(list, task('t2', { completedAt: '2026-10-13T11:00:00.000Z' }))
    expect(next[1]?.completedAt).not.toBeNull()
    expect(list[1]?.completedAt).toBeNull()
  })
})

describe('automations view', () => {
  it('puts each rule under its stage, oldest first', () => {
    const rules = [rule('r2', { createdAt: '2026-10-14T10:00:00.000Z' }), rule('r1'), rule('r3', { stageId: 'gone' })]
    expect(Object.entries(rulesByStage(rules, ['received', 'stage-0'])).map(([stage, items]) => [stage, items.map((item) => item.id)])).toEqual([
      ['received', []],
      ['stage-0', ['r1', 'r2']],
    ])
  })

  it('round-trips a rule through the form', () => {
    expect(ruleToForm(rule('r1'))).toEqual({ ...EMPTY_RULE_FORM, templateId: 't-update' })
    const taskRule = rule('r2', { action: taskAction('Prepara il colloquio', 'job_owner', 2) })
    expect(ruleToForm(taskRule)).toEqual({ ...EMPTY_RULE_FORM, type: 'create_task', title: 'Prepara il colloquio', assignee: 'job_owner', dueInDays: '2' })
    expect(ruleToForm(rule('r3', { action: taskAction('X', 'u2') })).dueInDays).toBe('')
  })

  it('validates the form of each action', () => {
    expect(validateRuleForm(EMPTY_RULE_FORM, 's', true).errors).toEqual({ templateId: 'automations.errors.templateRequired' })
    expect(validateRuleForm({ ...EMPTY_RULE_FORM, templateId: 't1' }, 's', false).input).toEqual({ stageId: 's', enabled: false, action: { type: 'send_template', templateId: 't1' } })
    const task = { ...EMPTY_RULE_FORM, type: 'create_task' as const }
    expect(validateRuleForm({ ...task, assignee: '', dueInDays: '91' }, 's', true).errors).toEqual({ title: 'tasks.errors.titleRequired', assignee: 'tasks.errors.assigneeRequired', dueInDays: 'automations.errors.dueInDays' })
    expect(validateRuleForm({ ...task, title: 'x'.repeat(201) }, 's', true).errors).toEqual({ title: 'tasks.errors.titleTooLong' })
    expect(validateRuleForm({ ...task, title: ' Chiama ', dueInDays: '0' }, 's', true).input).toEqual({ stageId: 's', enabled: true, action: { type: 'create_task', title: 'Chiama', assignee: 'job_owner', dueInDays: 0 } })
    expect(validateRuleForm({ ...task, title: 'Chiama' }, 's', true).input).toEqual({ stageId: 's', enabled: true, action: { type: 'create_task', title: 'Chiama', assignee: 'job_owner' } })
  })

  it('describes a rule in words', () => {
    const names = { template: (id: string) => (id === 't-update' ? 'Aggiornamento' : null), member: (id: string) => (id === 'u2' ? 'Bruno' : null) }
    expect(describeRule(rule('r1'), names)).toEqual({ key: 'automations.rule.sendTemplate', params: { template: 'Aggiornamento' } })
    expect(describeRule(rule('r1', { action: { type: 'send_template', templateId: 'gone' } }), names)).toEqual({ key: 'automations.rule.sendMissingTemplate', params: {} })
    expect(describeRule(rule('r2', { action: taskAction('T', 'job_owner', 2) }), names)).toEqual({ key: 'automations.rule.taskForOwnerDue', params: { title: 'T', count: 2 } })
    expect(describeRule(rule('r3', { action: taskAction('T', 'u2') }), names)).toEqual({ key: 'automations.rule.taskForMember', params: { title: 'T', member: 'Bruno' } })
    expect(describeRule(rule('r4', { action: taskAction('T', 'u9') }), names).params).toEqual({ title: 'T', member: '?' })
  })
})

describe('webhooks view', () => {
  it('toggles events keeping the canonical order', () => {
    expect(toggleEvent(['job.closed'], 'application.received')).toEqual(['application.received', 'job.closed'])
    expect(toggleEvent(['application.received', 'job.closed'], 'job.closed')).toEqual(['application.received'])
    expect(toggleEvent(['custom.event'], 'job.closed')).toEqual(['job.closed', 'custom.event'])
  })

  it('checks the address and the events', () => {
    expect(validateWebhookForm({ url: 'https://hooks.example.com/x', events: ['job.closed'] })).toEqual({})
    expect(validateWebhookForm({ url: 'http://localhost:4010/hook', events: ['job.closed'] })).toEqual({})
    expect(validateWebhookForm({ url: 'ftp://x', events: [] })).toEqual({ url: 'webhooks.errors.invalid_url', events: 'webhooks.errors.events' })
    expect(validateWebhookForm({ url: 'http://hooks.example.com', events: ['job.closed'] })).toEqual({ url: 'webhooks.errors.https_required' })
    expect(validateWebhookForm({ url: 'https://user:pw@x.test', events: ['job.closed'] })).toEqual({ url: 'webhooks.errors.credentials_not_allowed' })
    expect(validateWebhookForm({ url: 'not a url', events: ['job.closed'] })).toEqual({ url: 'webhooks.errors.invalid_url' })
  })

  it('colours a delivery by its outcome', () => {
    expect(deliveryTone({ status: 'success', responseCode: 204, error: null })).toBe('success')
    expect(deliveryTone({ status: 'success', responseCode: null, error: null })).toBe('success')
    expect(deliveryTone({ status: 'failed', responseCode: 500, error: null })).toBe('destructive')
    expect(deliveryTone({ status: 'failed', responseCode: null, error: 'timeout' })).toBe('destructive')
    expect(deliveryTone({ status: 'pending', responseCode: null, error: null })).toBe('neutral')
  })
})
