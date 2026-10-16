import { describe, expect, it } from 'vitest'
import { initialLocale } from './initial-locale'

describe('initialLocale', () => {
  it('prefers the language the user picked', () => {
    expect(initialLocale({ cookie: 'en', platformDefault: 'it' })).toBe('en')
  })
  it('otherwise uses the instance default read at runtime, not the one baked into the image', () => {
    expect(initialLocale({ cookie: null, platformDefault: 'en' })).toBe('en')
    expect(initialLocale({ cookie: 'xx', platformDefault: 'en' })).toBe('en')
  })
  it('is null when neither is a supported language', () => {
    expect(initialLocale({ cookie: undefined, platformDefault: 'fr' })).toBeNull()
  })
})
