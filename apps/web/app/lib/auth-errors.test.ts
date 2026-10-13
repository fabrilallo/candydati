import { describe, expect, it } from 'vitest'
import { AppError, authErrorKey, errorKeyOf } from './auth-errors'

describe('authErrorKey', () => {
  it('maps known Better Auth codes', () => {
    expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe('errors.invalidCredentials')
    expect(authErrorKey({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', status: 422 })).toBe('errors.emailTaken')
    expect(authErrorKey({ code: 'ORGANIZATION_SLUG_ALREADY_TAKEN' })).toBe('errors.slugTaken')
  })

  it('falls back on the HTTP status', () => {
    expect(authErrorKey({ status: 403 })).toBe('errors.forbidden')
    expect(authErrorKey({ status: 401 })).toBe('errors.unauthenticated')
    expect(authErrorKey({ status: 429 })).toBe('errors.tooManyRequests')
    expect(authErrorKey({ status: 502 })).toBe('errors.unreachable')
  })

  it('has a generic key for everything else', () => {
    expect(authErrorKey({ message: 'boom' })).toBe('errors.generic')
    expect(authErrorKey(null)).toBe('errors.generic')
  })
})

describe('errorKeyOf', () => {
  it('reads the key of an AppError and never leaks other messages', () => {
    expect(errorKeyOf(new AppError('errors.forbidden'))).toBe('errors.forbidden')
    expect(errorKeyOf(new Error('secret stack'))).toBe('errors.generic')
    expect(errorKeyOf('x')).toBe('errors.generic')
  })
})
