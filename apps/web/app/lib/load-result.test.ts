import { describe, expect, it } from 'vitest'
import { AppError } from './auth-errors'
import { attempt } from './load-result'

describe('attempt', () => {
  it('wraps data', async () => {
    expect(await attempt(async () => 5)).toEqual({ data: 5, errorKey: null })
  })

  it('wraps an AppError key and hides unknown errors behind the generic key', async () => {
    expect(await attempt(async () => Promise.reject(new AppError('errors.forbidden')))).toEqual({ data: null, errorKey: 'errors.forbidden' })
    expect(await attempt(async () => Promise.reject(new Error('stack')))).toEqual({ data: null, errorKey: 'errors.generic' })
  })
})
