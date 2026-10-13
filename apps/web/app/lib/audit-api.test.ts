import { describe, expect, it, vi } from 'vitest'
import { AUDIT_PAGE_SIZE, auditLogUrl, fetchAuditLog, loadAuditPage, pageCount, type ApiRequest } from './audit-api'

const event = {
  id: 'e1',
  organizationId: 'o1',
  actor: { type: 'user', id: 'u1', onBehalfOfUserId: null, name: 'Ada' },
  action: 'organization.created',
  target: { type: 'organization', id: 'o1' },
  metadata: { role: 'owner' },
  occurredAt: '2026-10-13T10:00:00.000Z',
}
const envelope = { success: true, data: [event], error: null, meta: { total: 41, page: 2, limit: 20 } }

describe('auditLogUrl', () => {
  it('builds the paginated endpoint', () => {
    expect(auditLogUrl(2, 20)).toBe('/api/v1/audit-log?page=2&limit=20')
  })
})

describe('pageCount', () => {
  it('rounds up and is at least one', () => {
    expect(pageCount({ total: 41, page: 1, limit: 20 })).toBe(3)
    expect(pageCount({ total: 0, page: 1, limit: 20 })).toBe(1)
  })
})

describe('fetchAuditLog', () => {
  it('returns events and pagination meta from the envelope', async () => {
    const request = vi.fn<ApiRequest>(async () => ({ status: 200, body: envelope }))
    const result = await fetchAuditLog(request, 2)
    expect(request).toHaveBeenCalledWith(`/api/v1/audit-log?page=2&limit=${AUDIT_PAGE_SIZE}`)
    expect(result.events).toHaveLength(1)
    expect(result.meta).toEqual({ total: 41, page: 2, limit: 20 })
  })

  it('surfaces the envelope error as a translatable error', async () => {
    const request: ApiRequest = async () => ({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'No' } } })
    await expect(fetchAuditLog(request, 1)).rejects.toMatchObject({ key: 'errors.forbidden', code: 'forbidden' })
  })

  it('maps unknown envelope codes and plain HTTP failures', async () => {
    const odd: ApiRequest = async () => ({ status: 400, body: { success: false, data: null, error: { code: 'weird', message: 'x' } } })
    await expect(fetchAuditLog(odd, 1)).rejects.toMatchObject({ key: 'errors.generic' })
    const down: ApiRequest = async () => ({ status: 502, body: 'bad gateway' })
    await expect(fetchAuditLog(down, 1)).rejects.toMatchObject({ key: 'errors.unreachable' })
  })

  it('rejects a body that does not match the envelope', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: ApiRequest = async () => ({ status: 200, body: { success: true, data: [{ id: 1 }], error: null } })
    await expect(fetchAuditLog(broken, 1)).rejects.toMatchObject({ key: 'errors.generic', code: 'invalid_response' })
    spy.mockRestore()
  })

  it('rejects when the transport itself fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const offline: ApiRequest = async () => Promise.reject(new Error('offline'))
    await expect(fetchAuditLog(offline, 1)).rejects.toMatchObject({ key: 'errors.unreachable' })
    spy.mockRestore()
  })
})

describe('loadAuditPage', () => {
  it('returns the page on success', async () => {
    const result = await loadAuditPage(async () => ({ status: 200, body: envelope }), 2)
    expect(result.errorKey).toBeNull()
    expect(result.page?.events).toHaveLength(1)
  })

  it('returns the translation key on failure instead of throwing', async () => {
    const result = await loadAuditPage(async () => ({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'No' } } }), 1)
    expect(result).toEqual({ page: null, errorKey: 'errors.forbidden' })
  })
})
