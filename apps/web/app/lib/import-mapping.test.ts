import { describe, expect, it } from 'vitest'
import { emptyMapping, fieldOf, mappingChanged, mappingView, setHeaderField } from './import-mapping'

const base = { ...emptyMapping(), fullName: 'Nome', email: 'Email' }
const headers = ['Nome', 'Email', 'Varie']

describe('mappingView', () => {
  it('shows one row per column with its field and up to three non-empty samples', () => {
    const view = mappingView(headers, base, { Nome: ['Anna Rossi', '', '  ', 'Luca Bianchi', 'Sara Neri', 'Ugo Blu'] })
    expect(view.columns).toEqual([
      { header: 'Nome', field: 'fullName', samples: ['Anna Rossi', 'Luca Bianchi', 'Sara Neri'] },
      { header: 'Email', field: 'email', samples: [] },
      { header: 'Varie', field: null, samples: [] },
    ])
    expect(view.warnings).toEqual([])
  })

  it('warns when nothing names the person or there is no email, ignoring headers not in the sheet', () => {
    expect(mappingView(['Tel'], { ...emptyMapping(), phone: 'Tel' }, {}).warnings).toEqual(['noName', 'noEmail'])
    expect(mappingView(['File'], { ...emptyMapping(), file: 'File', email: 'Gone' }, {}).warnings).toEqual(['noEmail'])
  })
})

describe('setHeaderField', () => {
  it('moves a field to the picked column and leaves the input untouched', () => {
    const next = setHeaderField(base, 'Varie', 'email')
    expect(next.email).toBe('Varie')
    expect(fieldOf(next, 'Email')).toBeNull()
    expect(base.email).toBe('Email')
  })

  it('replaces the field a column held, or clears it', () => {
    expect(setHeaderField(base, 'Nome', 'firstName')).toMatchObject({ firstName: 'Nome', fullName: null })
    expect(setHeaderField(base, 'Nome', null).fullName).toBeNull()
  })
})

describe('mappingChanged', () => {
  it('tells whether any field points elsewhere', () => {
    expect(mappingChanged(base, { ...base })).toBe(false)
    expect(mappingChanged(base, setHeaderField(base, 'Email', null))).toBe(true)
  })
})
