import { describe, expect, it } from 'vitest'
import { formToPreview } from './ad-preview'
import { contentToForm, emptyForm, type JobForm } from './job-form'
import { completeContent } from '~~/test/fixtures/job-fixtures'

const form = (overrides: Partial<JobForm> = {}): JobForm => ({ ...emptyForm(), ...overrides })

describe('formToPreview', () => {
  it('renders a complete form exactly as the saved content', () => {
    expect(formToPreview(contentToForm(completeContent))).toEqual(completeContent)
  })

  it('keeps an empty draft renderable: empty title, defaults, no stages', () => {
    const preview = formToPreview(form())
    expect(preview.title).toBe('')
    expect(preview.salary).toEqual({ currency: 'EUR', period: 'year' })
    expect(preview.process).toEqual([])
    expect(preview.role).toBeUndefined()
  })

  it('drops what is not valid yet instead of failing the whole preview', () => {
    const preview = formToPreview(
      form({
        title: '  Designer  ',
        role: 'not-a-role',
        salaryMin: '45000',
        salaryMax: '4x',
        responseDays: '0',
        workMode: 'remote',
        city: 'Milano',
        onsiteDaysPerWeek: '3',
        process: [
          { id: '', title: '', type: 'screening_call', durationMinutes: '30', conductedBy: 'recruiter', note: ' ' },
          { id: '', title: '', type: 'offer', durationMinutes: '', conductedBy: 'founder', note: '' },
        ],
        responsibilities: [' a ', '', 'b'],
      }),
    )
    expect(preview.title).toBe('Designer')
    expect(preview.role).toBeUndefined()
    expect(preview.salary.min).toBe(45000)
    expect(preview.salary.max).toBeUndefined()
    expect(preview.responseDays).toBeUndefined()
    expect(preview.location).toEqual({})
    expect(preview.process).toEqual([{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }])
    expect(preview.responsibilities).toEqual(['a', 'b'])
  })

  it('keeps city and on-site days for hybrid work', () => {
    const preview = formToPreview(form({ workMode: 'hybrid', country: 'IT', city: 'Torino', onsiteDaysPerWeek: '2' }))
    expect(preview.location).toEqual({ country: 'IT', city: 'Torino', onsiteDaysPerWeek: 2 })
  })

  it('falls back to the default language for an unknown one', () => {
    expect(formToPreview(form({ language: 'xx' })).language).toBe('it')
  })

  it('keeps the title of a stage', () => {
    const stage = { id: '', title: ' Prova pratica ', type: 'live_exercise', durationMinutes: '60', conductedBy: 'recruiter', note: '' }
    expect(formToPreview(form({ process: [stage] })).process[0]?.title).toBe('Prova pratica')
  })
})
