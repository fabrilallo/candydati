import { describe, expect, it, vi } from 'vitest'
import { message, settings, template, TEMPLATES } from '~~/test/fixtures/message-fixtures'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import {
  createTemplate,
  deleteTemplate,
  getEmailSettings,
  listMessages,
  listTemplates,
  previewMessage,
  sendMessages,
  unknownFromFailure,
  updateEmailSettings,
  updateTemplate,
  verifyEmailDomain,
} from './message-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const invalid = (issues: { path: string; message: string }[]) => ({ status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'invalid', issues } } })

describe('messages', () => {
  it('loads one conversation and validates it', async () => {
    const request = send(ok([message('m1')]))
    expect((await listMessages(request, 'a 1')).map((item) => item.id)).toEqual(['m1'])
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/applications/a%201/messages')
  })

  it('refuses a message with an unknown status', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(listMessages(send(ok([{ ...message('m1'), status: 'bounced' }])), 'a1')).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('sends one draft to many applications, with the template only when chosen', async () => {
    const request = send(ok({ queued: 2, failed: 0 }))
    expect(await sendMessages(request, { applicationIds: ['a1', 'a2'], templateId: 't-no', subject: 'S', body: 'B' })).toBe(2)
    expect(request.mock.calls[0]).toEqual(['/api/v1/messages', { method: 'POST', body: { applicationIds: ['a1', 'a2'], subject: 'S', body: 'B', templateId: 't-no' } }])
    await sendMessages(request, { applicationIds: ['a1'], templateId: null, subject: 'S', body: 'B' })
    expect(request.mock.calls[1]?.[1]).toEqual({ method: 'POST', body: { applicationIds: ['a1'], subject: 'S', body: 'B' } })
  })

  it('names an unknown variable when the api refuses the send', async () => {
    const error = await sendMessages(send(invalid([{ path: 'body', message: 'unknown_variable:job.salary' }])), { applicationIds: ['a1'], templateId: null, subject: 'S', body: 'B' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).key).toBe('messages.errors.unknownVariable')
    expect(unknownFromFailure(error)).toEqual(['job.salary'])
    expect(unknownFromFailure(new Error('x'))).toEqual([])
  })

  it('keeps the usual message for other refusals', async () => {
    const error = await sendMessages(send(invalid([{ path: 'subject', message: 'too long' }])), { applicationIds: ['a1'], templateId: null, subject: 'S', body: 'B' }).catch((caught: unknown) => caught)
    expect((error as ApiFailure).key).not.toBe('messages.errors.unknownVariable')
  })

  it('previews a draft for one application', async () => {
    const request = send(ok({ subject: 'Ciao', body: 'Ciao Giulia', unknownVariables: [] }))
    expect((await previewMessage(request, { subject: 'Ciao', body: 'Ciao {{ candidate.firstName }}', applicationId: 'a1' })).body).toBe('Ciao Giulia')
    expect(request.mock.calls[0]).toEqual(['/api/v1/email-templates/preview', { method: 'POST', body: { subject: 'Ciao', body: 'Ciao {{ candidate.firstName }}', applicationId: 'a1' } }])
  })
})

describe('templates', () => {
  it('lists, creates, updates and deletes', async () => {
    expect((await listTemplates(send(ok(TEMPLATES)))).length).toBe(4)
    const input = { name: 'N', kind: 'custom' as const, subject: 'S', body: 'B' }
    const create = send(ok(template('t9')))
    await createTemplate(create, input)
    expect(create.mock.calls[0]).toEqual(['/api/v1/email-templates', { method: 'POST', body: input }])
    const update = send(ok(template('t9')))
    await updateTemplate(update, 't9', input)
    expect(update.mock.calls[0]).toEqual(['/api/v1/email-templates/t9', { method: 'PUT', body: input }])
    const remove = send(ok({ deleted: true }))
    await deleteTemplate(remove, 't9')
    expect(remove.mock.calls[0]).toEqual(['/api/v1/email-templates/t9', { method: 'DELETE' }])
  })
})

describe('email settings', () => {
  it('reads, saves and verifies', async () => {
    expect((await getEmailSettings(send(ok(settings())))).senderName).toBe('Acme Recruiting')
    const put = send(ok(settings({ fromAddress: 'jobs@acme.test' })))
    await updateEmailSettings(put, { senderName: 'Acme', fromAddress: 'jobs@acme.test' })
    expect(put.mock.calls[0]).toEqual(['/api/v1/email-settings', { method: 'PUT', body: { senderName: 'Acme', fromAddress: 'jobs@acme.test' } }])
    const verify = send(ok(settings({ domain: { name: 'acme.test', status: 'verified', records: [] } })))
    expect((await verifyEmailDomain(verify)).domain?.status).toBe('verified')
    expect(verify.mock.calls[0]).toEqual(['/api/v1/email-settings/verify', { method: 'POST' }])
  })
})
