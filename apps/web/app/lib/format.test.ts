import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './format'

describe('format', () => {
  it('formats in the requested locale and UTC-independent shape', () => {
    expect(formatDateTime('2026-10-13T10:05:00.000Z', 'en', 'UTC')).toBe('13 Oct 2026, 10:05')
    expect(formatDateTime('2026-10-13T10:05:00.000Z', 'it', 'UTC')).toBe('13 ott 2026, 10:05')
    expect(formatDate('2026-10-13T10:05:00.000Z', 'en', 'UTC')).toBe('13 Oct 2026')
  })

  it('returns the raw value for an invalid date instead of throwing', () => {
    expect(formatDateTime('nope', 'en')).toBe('nope')
    expect(formatDate('nope', 'it')).toBe('nope')
  })
})
