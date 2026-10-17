import { describe, expect, it, vi } from 'vitest'
import { instanceEmail } from '~~/test/fixtures/instance-email-fixtures'
import { ApiFailure } from './api-call'
import { getInstanceEmailSettings, isTestFailure, saveInstanceEmailSettings } from './instance-email-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const invalid = (issues: { path: string; message: string }[]) => ({ status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'invalid', issues } } })
const INPUT = { provider: 'resend' as const, resend: {}, sendingDomain: 'acme.test', fromLocal: 'noreply' }

describe('instance email api', () => {
  it('reads the settings of the instance', async () => {
    const request = send(ok(instanceEmail()))
    expect((await getInstanceEmailSettings(request)).source).toBe('none')
    expect(request.mock.calls[0]).toEqual(['/api/v1/instance/email-settings', undefined])
  })

  it('refuses a response that is not the contract', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(getInstanceEmailSettings(send(ok({ ...instanceEmail(), source: 'magic' })))).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('saves with a PUT and returns the verified settings', async () => {
    const request = send(ok(instanceEmail({ source: 'app', ready: true, provider: 'resend', resend: { hasApiKey: true }, sendingDomain: 'acme.test', verifiedAt: '2026-10-17T10:00:00.000Z' })))
    expect((await saveInstanceEmailSettings(request, INPUT)).ready).toBe(true)
    expect(request.mock.calls[0]).toEqual(['/api/v1/instance/email-settings', { method: 'PUT', body: INPUT }])
  })

  it('names a refused test email', async () => {
    const error = await saveInstanceEmailSettings(send(invalid([{ path: 'test', message: 'email_test_failed' }])), INPUT).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).key).toBe('instanceEmail.errors.testFailed')
    expect(isTestFailure(error)).toBe(true)
  })

  it('keeps the usual message for other refusals', async () => {
    const error = await saveInstanceEmailSettings(send(invalid([{ path: 'sendingDomain', message: 'not a domain name' }])), INPUT).catch((caught: unknown) => caught)
    expect((error as ApiFailure).key).toBe('instanceEmail.errors.invalid')
    expect(isTestFailure(error)).toBe(false)
    expect(isTestFailure(new Error('x'))).toBe(false)
    const forbidden = await saveInstanceEmailSettings(send({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'no' } } }), INPUT).catch((caught: unknown) => caught)
    expect((forbidden as ApiFailure).key).toBe('errors.forbidden')
  })
})
