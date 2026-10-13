import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes first and last word', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('Ada Augusta King')).toBe('AK')
  })

  it('handles single words, emails and blanks', () => {
    expect(initials('ada')).toBe('A')
    expect(initials('ada.lovelace@example.com')).toBe('AC')
    expect(initials('   ')).toBe('?')
  })
})
