import { describe, expect, it } from 'vitest'
import { amountDisplay, caretAfterDigits, digitsOnly, DURATION_PRESETS, durationOptions, listKeyAction, saveStateOf } from './editor-inputs'

describe('amount input', () => {
  it('keeps only digits, so pasted separators and currency signs are dropped', () => {
    expect(digitsOnly('45.000 €')).toBe('45000')
    expect(digitsOnly('60,000')).toBe('60000')
    expect(digitsOnly('abc')).toBe('')
    expect(digitsOnly('007')).toBe('7')
    expect(digitsOnly('0')).toBe('')
  })

  it('shows thousands separators in the language of the ad', () => {
    expect(amountDisplay('45000', 'it')).toBe('45.000')
    expect(amountDisplay('45000', 'en')).toBe('45,000')
    expect(amountDisplay('1200', 'it')).toBe('1.200')
    expect(amountDisplay('', 'it')).toBe('')
    expect(amountDisplay('12a', 'it')).toBe('12a')
  })

  it('puts the caret after the same number of digits once separators appear', () => {
    expect(caretAfterDigits('45.000', 2)).toBe(2)
    expect(caretAfterDigits('45.000', 3)).toBe(4)
    expect(caretAfterDigits('1.234.567', 7)).toBe(9)
    expect(caretAfterDigits('45.000', 0)).toBe(0)
  })
})

describe('durationOptions', () => {
  const tr = (key: string, params: Record<string, string | number> = {}) => `${key}:${Object.values(params).join(',')}`

  it('offers the presets, labelled as the candidate will read them', () => {
    const options = durationOptions('', tr)
    expect(options.map((option) => option.value)).toEqual(DURATION_PRESETS.map(String))
    expect(options[1]).toEqual({ value: '30', label: 'public.duration.minutes:30' })
  })

  it('keeps a saved duration that is not a preset, in order', () => {
    const values = durationOptions('50', tr).map((option) => option.value)
    expect(values.indexOf('50')).toBe(values.indexOf('45') + 1)
    expect(durationOptions('abc', tr)).toHaveLength(DURATION_PRESETS.length)
  })
})

describe('listKeyAction', () => {
  it('Enter adds a new item right after the current one', () => {
    expect(listKeyAction({ key: 'Enter', value: 'uno', index: 0, count: 2 })).toEqual({ kind: 'insert', at: 1 })
  })

  it('Backspace on an empty item removes it and goes back to the previous one', () => {
    expect(listKeyAction({ key: 'Backspace', value: '', index: 2, count: 3 })).toEqual({ kind: 'remove', index: 2, focus: 1 })
    expect(listKeyAction({ key: 'Backspace', value: '', index: 0, count: 2 })).toEqual({ kind: 'remove', index: 0, focus: 0 })
  })

  it('leaves typing alone otherwise', () => {
    expect(listKeyAction({ key: 'Backspace', value: 'x', index: 1, count: 2 })).toBeNull()
    expect(listKeyAction({ key: 'Backspace', value: '', index: 0, count: 1 })).toEqual({ kind: 'remove', index: 0, focus: null })
    expect(listKeyAction({ key: 'a', value: '', index: 0, count: 1 })).toBeNull()
    expect(listKeyAction({ key: 'Enter', value: 'x', index: 0, count: 1, composing: true })).toBeNull()
  })
})

describe('saveStateOf', () => {
  it.each([
    [{ busy: 'save', dirty: true, saved: true }, 'saving'],
    [{ busy: null, dirty: true, saved: true }, 'unsaved'],
    [{ busy: null, dirty: true, saved: false }, 'unsaved'],
    [{ busy: null, dirty: false, saved: true }, 'saved'],
    [{ busy: null, dirty: false, saved: false }, 'new'],
    [{ busy: 'publish', dirty: false, saved: true }, 'saved'],
  ] as const)('%o is %s', (input, expected) => {
    expect(saveStateOf(input)).toBe(expected)
  })
})
