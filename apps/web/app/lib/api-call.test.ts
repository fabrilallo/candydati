import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiFailure, callApi, defaultFailureKey } from './api-call'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown, meta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(meta ? { meta } : {}) } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('callApi', () => {
  it('validates the data and returns the page meta', async () => {
    const result = await callApi(send(ok([1, 2], { total: 2, page: 1, limit: 20 })), '/x', z.array(z.number()))
    expect(result).toEqual({ data: [1, 2], meta: { total: 2, page: 1, limit: 20 } })
    expect((await callApi(send(ok('a')), '/x', z.string())).meta).toBeNull()
  })

  it('turns an error envelope into an ApiFailure with status, code, message and issues', async () => {
    const body = { success: false, data: null, error: { code: 'validation_failed', message: 'Invalid', issues: [{ path: 'organization.privacyNotice', message: 'privacy_notice_required' }] } }
    const error = await callApi(send({ status: 422, body }), '/x', z.unknown()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).failure).toEqual({ status: 422, code: 'validation_failed', message: 'Invalid', issues: [{ path: 'organization.privacyNotice', message: 'privacy_notice_required' }] })
    expect((error as ApiFailure).key).toBe('errors.generic')
  })

  it('uses the caller mapping for the translation key', async () => {
    const body = { success: false, data: null, error: { code: 'conflict', message: 'already_applied' } }
    await expect(callApi(send({ status: 409, body }), '/x', z.unknown(), undefined, (failure) => `k.${failure.message}`)).rejects.toMatchObject({ key: 'k.already_applied', code: 'conflict' })
  })

  it('maps a non-envelope failure (a proxy 413) by status', async () => {
    const error = (await callApi(send({ status: 413, body: 'Payload Too Large' }), '/x', z.unknown()).catch((caught: unknown) => caught)) as ApiFailure
    expect(error.failure).toEqual({ status: 413, code: null, message: null, issues: [] })
    await expect(callApi(send({ status: 429, body: null }), '/x', z.unknown())).rejects.toMatchObject({ key: 'errors.tooManyRequests' })
  })

  it('rejects a success with the wrong shape without leaking it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(callApi(send(ok({ nope: true })), '/x', z.string())).rejects.toMatchObject({ key: 'errors.generic', code: 'invalid_response' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('reports an unreachable api as status 0', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = vi.fn<JobApiRequest>(async () => {
      throw new Error('ECONNREFUSED')
    })
    const error = (await callApi(request, '/x', z.unknown()).catch((caught: unknown) => caught)) as ApiFailure
    expect(error.failure.status).toBe(0)
    expect(error.key).toBe('errors.unreachable')
    spy.mockRestore()
  })

  it('passes method and body through the seam', async () => {
    const request = send(ok(null))
    await callApi(request, '/x', z.null(), { method: 'PATCH', body: { tags: [] } })
    expect(request.mock.calls[0]).toEqual(['/x', { method: 'PATCH', body: { tags: [] } }])
  })
})

describe('defaultFailureKey', () => {
  it('knows the common codes and falls back to the status', () => {
    expect(defaultFailureKey({ status: 404, code: 'not_found', message: null, issues: [] })).toBe('errors.notFound')
    expect(defaultFailureKey({ status: 403, code: 'forbidden', message: null, issues: [] })).toBe('errors.forbidden')
    expect(defaultFailureKey({ status: 409, code: 'conflict', message: null, issues: [] })).toBe('errors.conflict')
    expect(defaultFailureKey({ status: 500, code: 'boom', message: null, issues: [] })).toBe('errors.unreachable')
  })
})
