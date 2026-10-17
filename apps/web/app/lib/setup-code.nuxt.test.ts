import { beforeEach, describe, expect, it } from 'vitest'
import { forgetSetupCode, takeSetupCode } from './setup-code'

beforeEach(() => window.sessionStorage.clear())

describe('takeSetupCode', () => {
  it('reads the code from the link and keeps it for a reload of the same tab', () => {
    expect(takeSetupCode('#code=abc-123')).toBe('abc-123')
    expect(takeSetupCode('')).toBe('abc-123')
  })

  it('prefers a new link over the kept code, and gives nothing when there never was one', () => {
    takeSetupCode('#code=old')
    expect(takeSetupCode('#code=new')).toBe('new')
    window.sessionStorage.clear()
    expect(takeSetupCode('')).toBe('')
  })

  it('forgets the code once the account exists', () => {
    takeSetupCode('#code=abc')
    forgetSetupCode()
    expect(takeSetupCode('')).toBe('')
  })
})
