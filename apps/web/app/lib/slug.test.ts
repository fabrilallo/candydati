import { describe, expect, it } from 'vitest'
import { isValidSlug, slugify, SLUG_MAX_LENGTH } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Acme Recruiting')).toBe('acme-recruiting')
  })

  it('strips diacritics and punctuation', () => {
    expect(slugify('  Società Città & Co.  ')).toBe('societa-citta-co')
  })

  it('collapses separators and trims dashes', () => {
    expect(slugify('--a   b__c--')).toBe('a-b-c')
  })

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} bbbb`)
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('isValidSlug', () => {
  it.each([['acme', true], ['acme-2', true], ['Acme', false], ['-acme', false], ['acme--x', false], ['', false], ['a'.repeat(SLUG_MAX_LENGTH + 1), false]])('%s -> %s', (value, expected) => {
    expect(isValidSlug(value)).toBe(expected)
  })
})
