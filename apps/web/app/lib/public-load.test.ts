import { describe, expect, it, vi } from 'vitest'
import { AppError } from './auth-errors'
import { failureStatus, loadPublic } from './public-load'

describe('loadPublic', () => {
  it('returns the data', async () => {
    const result = await loadPublic(async () => 42)
    expect(result).toEqual({ kind: 'ok', data: 42 })
    expect(failureStatus(result)).toBeNull()
  })

  it('maps a not-found api error to 404', async () => {
    const result = await loadPublic(async () => {
      throw new AppError('errors.notFound', 'not_found')
    })
    expect(failureStatus(result)).toBe(404)
  })

  it('maps anything else to 503 and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    for (const error of [new AppError('errors.unreachable'), new AppError('errors.generic', 'invalid_response'), new Error('boom'), 'x']) {
      const result = await loadPublic(async () => {
        throw error
      })
      expect(failureStatus(result)).toBe(503)
    }
    expect(spy).toHaveBeenCalledTimes(4)
    spy.mockRestore()
  })
})
