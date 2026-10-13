import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TIME_ZONE, displayTimeZone, formatDate, formatDateTime, isValidTimeZone, setDisplayTimeZone } from './format'

const originalTz = process.env.TZ
afterEach(() => {
  setDisplayTimeZone(DEFAULT_TIME_ZONE)
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

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

  it('uses the organization time zone, not the one of the machine: server and browser print the same text', () => {
    const iso = '2026-10-13T22:30:00.000Z'
    const printed = ['America/Los_Angeles', 'Asia/Tokyo', 'UTC'].map((zone) => {
      process.env.TZ = zone
      return [formatDateTime(iso, 'it'), formatDate(iso, 'it')]
    })
    // 22:30 UTC is already the next day in Rome (CEST, UTC+2)
    expect(printed[0]).toEqual(['14 ott 2026, 00:30', '14 ott 2026'])
    expect(printed[1]).toEqual(printed[0])
    expect(printed[2]).toEqual(printed[0])
  })

  it('follows the configured zone and ignores an invalid one', () => {
    setDisplayTimeZone('America/New_York')
    expect(displayTimeZone()).toBe('America/New_York')
    expect(formatDateTime('2026-10-13T10:05:00.000Z', 'en')).toBe('13 Oct 2026, 06:05')
    setDisplayTimeZone('Mars/Olympus')
    expect(displayTimeZone()).toBe(DEFAULT_TIME_ZONE)
    setDisplayTimeZone(undefined)
    expect(displayTimeZone()).toBe(DEFAULT_TIME_ZONE)
  })

  it('knows a valid IANA zone', () => {
    expect(isValidTimeZone('Europe/Rome')).toBe(true)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('nope')).toBe(false)
  })
})
