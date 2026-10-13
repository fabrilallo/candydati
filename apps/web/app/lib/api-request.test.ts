import { describe, expect, it, vi } from 'vitest'
import { toApiRequest } from './api-request'

describe('toApiRequest', () => {
  it('turns a $fetch.raw-like function into status and body, without throwing on errors', async () => {
    const raw = vi.fn(async () => ({ status: 403, _data: { success: false } }))
    const request = toApiRequest(raw)
    expect(await request('/api/v1/x')).toEqual({ status: 403, body: { success: false } })
    expect(raw).toHaveBeenCalledWith('/api/v1/x', { ignoreResponseError: true, headers: { accept: 'application/json' } })
  })
})
