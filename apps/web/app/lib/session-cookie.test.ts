import { describe, expect, it } from 'vitest'
import { hasSessionCookie } from './session-cookie'

describe('hasSessionCookie', () => {
  it('detects the plain and the secure-prefixed Better Auth cookie', () => {
    expect(hasSessionCookie('a=1; better-auth.session_token=abc.def; b=2')).toBe(true)
    expect(hasSessionCookie('__Secure-better-auth.session_token=abc')).toBe(true)
  })

  it('ignores other cookies, values that merely mention it, and empty headers', () => {
    expect(hasSessionCookie('tt.locale=it; tt.theme=dark')).toBe(false)
    expect(hasSessionCookie('x=better-auth.session_token')).toBe(false)
    expect(hasSessionCookie('')).toBe(false)
    expect(hasSessionCookie(undefined)).toBe(false)
  })
})
