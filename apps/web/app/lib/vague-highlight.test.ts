import { describe, expect, it } from 'vitest'
import { phrasesIn, splitHighlights } from './vague-highlight'

const phrase = (text: string) => ({ text, category: 'salary_transparency' as const, suggestion: `riscrivi ${text}` })

describe('splitHighlights', () => {
  it('returns the plain text when there is nothing to highlight', () => {
    expect(splitHighlights('Ciao a tutti', [])).toEqual([{ text: 'Ciao a tutti', phrase: null }])
    expect(splitHighlights('', [phrase('x')])).toEqual([])
  })

  it('marks every occurrence, ignoring case, keeping the original spelling', () => {
    const parts = splitHighlights('Offriamo uno Stipendio competitivo e un ambiente. Stipendio competitivo!', [phrase('stipendio competitivo')])
    expect(parts.map((part) => [part.text, part.phrase !== null])).toEqual([
      ['Offriamo uno ', false],
      ['Stipendio competitivo', true],
      [' e un ambiente. ', false],
      ['Stipendio competitivo', true],
      ['!', false],
    ])
  })

  it('prefers the longer phrase when two overlap, and never nests', () => {
    const parts = splitHighlights('un ambiente giovane e dinamico', [phrase('ambiente giovane'), phrase('ambiente giovane e dinamico'), phrase('dinamico')])
    expect(parts.map((part) => part.text)).toEqual(['un ', 'ambiente giovane e dinamico'])
    expect(parts[1]?.phrase?.text).toBe('ambiente giovane e dinamico')
  })

  it('ignores blank phrases and treats regex characters literally', () => {
    expect(splitHighlights('costo (circa) 10$', [phrase('  '), phrase('(circa)')]).map((part) => part.text)).toEqual(['costo ', '(circa)', ' 10$'])
  })
})

describe('phrasesIn', () => {
  it('keeps only the phrases found in some text of the ad', () => {
    const found = phrasesIn(['Stipendio competitivo', 'altro'], [phrase('stipendio competitivo'), phrase('assente')])
    expect(found.map((item) => item.text)).toEqual(['stipendio competitivo'])
  })
})
