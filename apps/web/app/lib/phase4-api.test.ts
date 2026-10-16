import { describe, expect, it, vi } from 'vitest'
import { attentionItem, notification, rule, task, webhook } from '~~/test/fixtures/phase4-fixtures'
import { ApiFailure } from './api-call'
import { AppError } from './auth-errors'
import { attentionTotals, attentionUrl, decideApplications, listAttention, openApplicationsOf } from './attention-api'
import { createRule, createWebhook, deleteRule, deleteWebhook, listDeliveries, listRules, listWebhooks, testWebhook, updateRule, updateWebhook } from './automation-api'
import { createTask, listApplicationTasks, listMyTasks, listNotifications, markRead, setTaskDone, unreadCount } from './inbox-api'
import type { JobApiRequest } from './job-api'

const meta = (total: number) => ({ total, page: 1, limit: 1 })
const ok = (data: unknown, pageMeta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(pageMeta ? { meta: pageMeta } : {}) } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const refused = (message: string) => ({ status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'invalid', issues: [{ path: 'applications', message }] } } })

describe('attention api', () => {
  it('lists late or near answers with the page meta', async () => {
    const request = send(ok([attentionItem('a1')], meta(3)))
    const page = await listAttention(request, 'overdue', 2)
    expect(page.items.map((item) => item.applicationId)).toEqual(['a1'])
    expect(page.meta.total).toBe(3)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/applications/attention?state=overdue&page=2&limit=25')
    expect(attentionUrl('due_soon', 1, 1)).toBe('/api/v1/applications/attention?state=due_soon&page=1&limit=1')
  })

  it('refuses a list without meta and sums both totals for the sidebar', async () => {
    await expect(listAttention(send(ok([])), 'overdue', 1)).rejects.toMatchObject({ code: 'invalid_response' })
    const request = vi.fn<JobApiRequest>(async (url) => ok([], meta(url.includes('overdue') ? 2 : 5)))
    expect(await attentionTotals(request)).toEqual({ overdue: 2, dueSoon: 5 })
  })

  it('decides many applications in one call', async () => {
    const request = send(ok({ decided: 2 }))
    expect(await decideApplications(request, ['a1', 'a2'], 'not_selected')).toBe(2)
    expect(request.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { applicationIds: ['a1', 'a2'], outcome: 'not_selected' } })
  })

  it('reads the open applications from a refused close, whatever the client', async () => {
    const error = await callFailing(refused('open_applications:4'))
    expect(error).toBeInstanceOf(ApiFailure)
    expect(openApplicationsOf(error)).toBe(4)
    expect(openApplicationsOf(new AppError('job.errors.validationFailed', 'validation_failed', [{ path: 'applications', message: 'open_applications:2' }]))).toBe(2)
    expect(openApplicationsOf(new AppError('x', null, [{ path: 'applications', message: 'open_applications:many' }]))).toBeNull()
    expect(openApplicationsOf(await callFailing(refused('something_else')))).toBeNull()
    expect(openApplicationsOf(new Error('x'))).toBeNull()
  })
})

const callFailing = (response: { status: number; body: unknown }) => decideApplications(send(response), ['a1'], 'hired').catch((caught: unknown) => caught)

describe('notifications and tasks api', () => {
  it('reads the unread count', async () => {
    expect(await unreadCount(send(ok({ count: 3 })))).toBe(3)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(unreadCount(send(ok({ unread: 7 })))).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('lists notifications, unread only when asked, and marks them read', async () => {
    const request = send(ok([notification('n1')]))
    expect((await listNotifications(request, { unread: true })).items[0]?.kind).toBe('response_overdue')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/notifications?unread=true&page=1&limit=20')
    await listNotifications(request)
    expect(request.mock.calls[1]?.[0]).toBe('/api/v1/notifications?page=1&limit=20')
    await markRead(request, { all: true })
    expect(request.mock.calls[2]).toEqual(['/api/v1/notifications/read', { method: 'POST', body: { all: true } }])
  })

  it('lists my tasks and the tasks of one application', async () => {
    const request = send(ok([task('t1')]))
    expect((await listMyTasks(request))[0]?.id).toBe('t1')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/tasks?mine=true&open=true')
    await listApplicationTasks(request, 'a 1')
    expect(request.mock.calls[1]?.[0]).toBe('/api/v1/applications/a%201/tasks')
  })

  it('creates a task sending only what is set, completes and reopens it', async () => {
    const request = send(ok(task('t1')))
    await createTask(request, { title: 'Chiama', assigneeId: 'u2', dueAt: null, applicationId: 'a1', jobId: null })
    expect(request.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { title: 'Chiama', assigneeId: 'u2', applicationId: 'a1' } })
    await createTask(request, { title: 'Chiama', assigneeId: 'u2', dueAt: '2026-10-14T16:00:00.000Z', applicationId: null, jobId: 'j1' })
    expect(request.mock.calls[1]?.[1]).toEqual({ method: 'POST', body: { title: 'Chiama', assigneeId: 'u2', dueAt: '2026-10-14T16:00:00.000Z', jobId: 'j1' } })
    await setTaskDone(request, 't1', true)
    await setTaskDone(request, 't1', false)
    expect(request.mock.calls.slice(2).map((call) => call[0])).toEqual(['/api/v1/tasks/t1/complete', '/api/v1/tasks/t1/reopen'])
  })

  it('reads the task as the api sends it: the assignee as a person, the author as an id', async () => {
    const [fromApi] = await listMyTasks(send(ok([task('t1', { assignee: { id: 'u7', name: 'Elena' }, createdBy: 'u9' })])))
    expect(fromApi?.assignee).toEqual({ id: 'u7', name: 'Elena' })
    expect(fromApi?.createdBy).toBe('u9')
  })

  it('refuses a task without its assignee', async () => {
    const { assignee: _assignee, ...rest } = task('t1')
    await expect(listMyTasks(send(ok([rest])))).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('automations and webhooks api', () => {
  it('lists, creates, updates and deletes the rules of a job', async () => {
    const request = send(ok([rule('r1')]))
    expect((await listRules(request, 'j1'))[0]?.action.type).toBe('send_template')
    const single = send(ok(rule('r1')))
    const input = { stageId: 'stage-0', enabled: true, action: { type: 'send_template' as const, templateId: 't1' } }
    await createRule(single, 'j1', input)
    await updateRule(single, 'r1', input)
    await deleteRule(single, 'r1')
    expect(single.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/v1/jobs/j1/automations', 'POST'],
      ['/api/v1/automations/r1', 'PUT'],
      ['/api/v1/automations/r1', 'DELETE'],
    ])
  })

  it('refuses a rule with an action the contract does not have', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(listRules(send(ok([{ ...rule('r1'), action: { type: 'move', stageId: 'x' } }])), 'j1')).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('manages webhooks, with the secret only on create', async () => {
    const list = send(ok([webhook('w1')]))
    expect((await listWebhooks(list))[0]?.url).toBe('https://hooks.example.com/candydati')
    const created = await createWebhook(send(ok({ ...webhook('w1'), secret: 'whsec_1' })), { url: 'https://x.test', events: ['job.closed'], enabled: true })
    expect(created.secret).toBe('whsec_1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(createWebhook(send(ok(webhook('w1'))), { url: 'https://x.test', events: [], enabled: true })).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
    const single = send(ok(webhook('w1')))
    await updateWebhook(single, 'w1', { url: 'https://x.test', events: ['job.closed'], enabled: false })
    await testWebhook(single, 'w1')
    await deleteWebhook(single, 'w1')
    expect(single.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/v1/webhooks/w1', 'PUT'],
      ['/api/v1/webhooks/w1/test', 'POST'],
      ['/api/v1/webhooks/w1', 'DELETE'],
    ])
    const base = { id: 'd1', eventId: 'ev1', status: 'success', responseCode: 200, attempt: 1, error: null, createdAt: '2026-10-13T10:00:00.000Z' }
    const deliveries = await listDeliveries(send(ok([{ ...base, eventType: 'ping' }, { ...base, eventType: 'job.closed', status: 'failed' }])), 'w1')
    expect(deliveries.map((item) => [item.eventType, item.status])).toEqual([['ping', 'success'], ['job.closed', 'failed']])
  })
})
