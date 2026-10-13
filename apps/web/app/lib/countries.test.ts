import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES, countryName, countryOptions } from './countries'

describe('countries', () => {
  it('only holds two-letter upper-case codes, without duplicates', () => {
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true)
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
  })

  it('names countries in the locale', () => {
    expect(countryName('IT', 'it')).toBe('Italia')
    expect(countryName('DE', 'en')).toBe('Germany')
    expect(countryName('??', 'en')).toBe('??')
  })

  it('sorts by name and keeps an unknown current code', () => {
    const names = countryOptions('en').map((o) => o.name)
    expect(names).toEqual([...names].sort(new Intl.Collator('en-GB').compare))
    expect(countryOptions('en', 'QQ').some((o) => o.code === 'QQ')).toBe(true)
    expect(countryOptions('en', 'IT')).toHaveLength(COUNTRY_CODES.length)
  })
})
