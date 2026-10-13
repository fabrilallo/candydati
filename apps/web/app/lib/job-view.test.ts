import { describe, expect, it } from 'vitest'
import { translatorFor } from '~~/test/fixtures/ad-translate'
import { absoluteUrl, careersPath, formatDuration, placeLine, publicJobPath, salaryLine, salaryRange, statusTone, workLine } from './job-view'

const salary = { min: 45000, max: 60000, currency: 'EUR' as const, period: 'year' as const }

describe('salary', () => {
  it('shows the range in the language of the ad', () => {
    expect(salaryRange(salary, 'en')).toBe('€45,000 - €60,000')
    expect(salaryRange(salary, 'it').replace(/\s/g, ' ')).toBe('45.000 € - 60.000 €')
  })

  it('states that amounts are gross', () => {
    expect(salaryLine(salary, 'en', translatorFor('en'))).toBe('€45,000 - €60,000, gross per year')
    expect(salaryLine({ ...salary, period: 'month' }, 'it', translatorFor('it'))).toContain('lordi al mese')
  })

  it('handles equal and single bounds', () => {
    expect(salaryRange({ ...salary, max: 45000 }, 'en')).toBe('€45,000')
    expect(salaryRange({ currency: 'EUR', period: 'year', min: 30000 }, 'en')).toBe('€30,000')
    expect(salaryRange({ currency: 'EUR', period: 'year' }, 'en')).toBe('')
    expect(salaryLine({ currency: 'EUR', period: 'year' }, 'en', translatorFor('en'))).toBe('')
  })
})

describe('formatDuration', () => {
  it.each([
    [30, 'en', '30 min'],
    [60, 'en', '1 h'],
    [90, 'it', '1 h 30 min'],
    [2880, 'en', '2 d'],
  ])('%i minutes in %s', (minutes, language, expected) => {
    expect(formatDuration(minutes, translatorFor(language))).toBe(expected)
  })
})

describe('places and urls', () => {
  it('writes the place, ignoring the city for remote work', () => {
    expect(placeLine({ workMode: 'hybrid', location: { country: 'IT', city: 'Milano' } }, 'it')).toBe('Milano, Italia')
    expect(placeLine({ workMode: 'remote', location: { country: 'IT', city: 'Milano' } }, 'it')).toBe('Italia')
    expect(placeLine({ workMode: undefined, location: {} }, 'it')).toBe('')
  })

  it('joins work mode and place', () => {
    expect(workLine({ workMode: 'hybrid', location: { country: 'DE', city: 'Berlin' } }, 'en', translatorFor('en'))).toBe('Hybrid · Berlin, Germany')
    expect(workLine({ workMode: undefined, location: {} }, 'en', translatorFor('en'))).toBe('')
  })

  it('builds stable path urls and absolute urls', () => {
    expect(careersPath('acme')).toBe('/careers/acme')
    expect(publicJobPath('acme', 'dev-1')).toBe('/careers/acme/dev-1')
    expect(absoluteUrl('https://example.com/', '/careers/acme')).toBe('https://example.com/careers/acme')
  })

  it('maps a status to a badge tone', () => {
    expect([statusTone('published'), statusTone('draft'), statusTone('closed')]).toEqual(['success', 'secondary', 'outline'])
  })
})
