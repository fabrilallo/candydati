import { describe, expect, it } from 'vitest'
import { insertAtCursor, templateSegments, variableToken } from './template-text'

describe('variableToken', () => {
  it('writes the variable in the template syntax', () => {
    expect(variableToken('candidate.firstName')).toBe('{{ candidate.firstName }}')
  })
})

describe('insertAtCursor', () => {
  it('inserts at the caret and puts the caret after the insertion', () => {
    expect(insertAtCursor('Ciao ,', 5, 5, '{{ x }}')).toEqual({ text: 'Ciao {{ x }},', cursor: 12 })
  })

  it('replaces the selected text', () => {
    expect(insertAtCursor('Ciao NOME!', 5, 9, 'X')).toEqual({ text: 'Ciao X!', cursor: 6 })
  })

  it('appends when the caret is unknown or out of range', () => {
    expect(insertAtCursor('Ciao', null, null, ' X')).toEqual({ text: 'Ciao X', cursor: 6 })
    expect(insertAtCursor('Ciao', 99, 120, '!')).toEqual({ text: 'Ciao!', cursor: 5 })
  })

  it('treats a reversed selection as its normal order', () => {
    expect(insertAtCursor('abcdef', 4, 2, 'X')).toEqual({ text: 'abXef', cursor: 3 })
  })
})

describe('templateSegments', () => {
  it('splits text into plain parts, known and unknown variables', () => {
    expect(templateSegments('Ciao {{ candidate.firstName }}, {{ job.salary }}!')).toEqual([
      { kind: 'text', value: 'Ciao ' },
      { kind: 'known', value: '{{ candidate.firstName }}', name: 'candidate.firstName' },
      { kind: 'text', value: ', ' },
      { kind: 'unknown', value: '{{ job.salary }}', name: 'job.salary' },
      { kind: 'text', value: '!' },
    ])
  })

  it('marks as unknown only the names it is told about when a list is given', () => {
    expect(templateSegments('Ciao {{ x }} e {{ y }}', ['y']).map((segment) => segment.kind)).toEqual(['text', 'known', 'text', 'unknown'])
  })

  it('returns no segment for an empty text', () => {
    expect(templateSegments('')).toEqual([])
  })
})
