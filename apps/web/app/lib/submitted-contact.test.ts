import { describe, expect, it } from 'vitest'
import { contactChanges, correctionOf } from './submitted-contact'

const candidate = { firstName: 'Ada', lastName: 'Lovelace', phone: '+39 02 1234567', linkedinUrl: null as string | null }
const submitted = (overrides: Partial<NonNullable<Parameters<typeof contactChanges>[1]>> = {}) => ({ firstName: 'Ada', lastName: 'Lovelace', phone: '+39 02 1234567', linkedinUrl: null, ...overrides })

describe('contactChanges', () => {
  it('is empty when nothing differs or nothing was submitted', () => {
    expect(contactChanges(candidate, submitted())).toEqual([])
    expect(contactChanges(candidate, null)).toEqual([])
    expect(contactChanges(candidate, undefined)).toEqual([])
    expect(contactChanges(candidate, submitted({ firstName: ' ada ' }))).toEqual([])
  })
  it('lists every field that differs, with both values', () => {
    expect(contactChanges(candidate, submitted({ firstName: 'Mallory', phone: '+39 333 1234567', linkedinUrl: 'https://linkedin.com/in/m' }))).toEqual([
      { field: 'firstName', current: 'Ada', submitted: 'Mallory' },
      { field: 'phone', current: '+39 02 1234567', submitted: '+39 333 1234567' },
      { field: 'linkedinUrl', current: null, submitted: 'https://linkedin.com/in/m' },
    ])
  })
  it('ignores a field the person left empty', () => {
    expect(contactChanges(candidate, submitted({ phone: null }))).toEqual([])
  })
})

describe('correctionOf', () => {
  it('builds a correction with only the chosen fields', () => {
    const changes = contactChanges(candidate, submitted({ firstName: 'Augusta', linkedinUrl: 'https://linkedin.com/in/a' }))
    expect(correctionOf(changes)).toEqual({ firstName: 'Augusta', linkedinUrl: 'https://linkedin.com/in/a' })
  })
})
