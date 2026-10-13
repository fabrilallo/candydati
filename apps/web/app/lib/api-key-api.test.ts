import { describe, expect, it, vi } from 'vitest'
import { apiKey, openApiSpec } from '~~/test/fixtures/phase6-fixtures'
import { ApiFailure } from './api-call'
import { createApiKey, getOpenApiSpec, listApiKeys, revokeApiKey } from './api-key-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('api keys api', () => {
  it('lists keys with the creator name and only known scopes', async () => {
    const request = send(ok([apiKey('k1', { scopes: ['job:read', 'future:thing'] }), apiKey('k2', { createdBy: 'u2', createdByName: 'Bea' })]))
    const keys = await listApiKeys(request)
    expect(request.mock.calls[0]).toEqual(['/api/v1/api-keys', undefined])
    expect(keys[0]).toMatchObject({ id: 'k1', createdByName: 'Ada Lovelace', scopes: ['job:read'] })
    expect(keys[1]?.createdByName).toBe('Bea')
  })

  it('creates a key and returns the secret once, nested or flat', async () => {
    const nested = send(ok({ key: apiKey('k3'), secret: 'tt_Ab12Cd34_secret' }))
    const created = await createApiKey(nested, { name: 'CI', scopes: ['job:read'], expiresAt: null })
    expect(nested.mock.calls[0]).toEqual(['/api/v1/api-keys', { method: 'POST', body: { name: 'CI', scopes: ['job:read'] } }])
    expect(created).toMatchObject({ key: { id: 'k3' }, secret: 'tt_Ab12Cd34_secret' })

    const flat = send(ok({ ...apiKey('k4'), secret: 'tt_flat' }))
    const withExpiry = await createApiKey(flat, { name: 'CI', scopes: ['job:read'], expiresAt: '2026-11-12T10:00:00.000Z' })
    expect(flat.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { name: 'CI', scopes: ['job:read'], expiresAt: '2026-11-12T10:00:00.000Z' } })
    expect(withExpiry.key.id).toBe('k4')
  })

  it('revokes a key by id', async () => {
    const request = send(ok(apiKey('k 1', { revokedAt: '2026-10-13T10:00:00.000Z' })))
    await revokeApiKey(request, 'k 1')
    expect(request.mock.calls[0]).toEqual(['/api/v1/api-keys/k%201', { method: 'DELETE' }])
  })

  it('turns a refusal into an ApiFailure', async () => {
    const refused = send({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'no' } } })
    await expect(listApiKeys(refused)).rejects.toBeInstanceOf(ApiFailure)
  })
})

describe('openapi spec', () => {
  it('reads the raw document or one wrapped in the envelope', async () => {
    expect((await getOpenApiSpec(send({ status: 200, body: openApiSpec }))).openapi).toBe('3.1.0')
    expect((await getOpenApiSpec(send(ok(openApiSpec)))).paths['/api/v1/jobs']).toBeDefined()
  })

  it('fails with a readable key on errors and on anything that is not a spec', async () => {
    await expect(getOpenApiSpec(send({ status: 404, body: null }))).rejects.toMatchObject({ key: 'errors.notFound' })
    await expect(getOpenApiSpec(send({ status: 200, body: { hello: 'world' } }))).rejects.toMatchObject({ key: 'errors.generic' })
    await expect(getOpenApiSpec(vi.fn<JobApiRequest>(async () => Promise.reject(new Error('down'))))).rejects.toMatchObject({ key: 'errors.unreachable' })
  })
})
