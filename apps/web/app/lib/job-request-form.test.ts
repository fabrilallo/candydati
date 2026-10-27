import { describe, expect, it } from 'vitest'
import { emptyRequestForm, requestFormFromTitle, requestLanguage, toRequestInput, validateRequestForm, type JobRequestForm } from './job-request-form'

const valid: JobRequestForm = { ...emptyRequestForm(), title: 'Backend developer', role: 'backend_developer', reason: 'Servono due persone.', headcount: '2', salaryMin: '45000', salaryMax: '60000' }

describe('job request form', () => {
  it('starts empty with one person and euros', () => {
    expect(emptyRequestForm()).toMatchObject({ title: '', headcount: '1', currency: 'EUR', salaryMin: '', salaryMax: '' })
  })

  it('prefills the title from the query and trims it', () => {
    expect(requestFormFromTitle('  Data engineer ').title).toBe('Data engineer')
    expect(requestFormFromTitle(undefined).title).toBe('')
    expect(requestFormFromTitle(['a']).title).toBe('')
  })

  it('accepts a complete form', () => {
    expect(validateRequestForm(valid)).toEqual({})
  })

  it('requires title, role, reason and the budget', () => {
    const errors = validateRequestForm(emptyRequestForm())
    expect(errors).toMatchObject({
      title: 'jobRequests.errors.title',
      role: 'jobRequests.errors.role',
      reason: 'jobRequests.errors.reason',
      salaryMin: 'jobRequests.errors.salaryMin',
      salaryMax: 'jobRequests.errors.salaryMax',
    })
  })

  it('accepts a custom role only with its text', () => {
    const other = { ...valid, role: 'other' }
    expect(validateRequestForm(other).customRole).toBe('jobRequests.errors.customRole')
    expect(validateRequestForm({ ...other, customRole: ' Pastry chef ' })).toEqual({})
    expect(toRequestInput({ ...other, customRole: ' Pastry chef ' }, 'it')).toMatchObject({ role: 'other', customRole: 'Pastry chef' })
    expect(toRequestInput(valid, 'it')).not.toHaveProperty('customRole')
  })

  it('wants at least one person, whole and not absurd', () => {
    expect(validateRequestForm({ ...valid, headcount: '0' }).headcount).toBe('jobRequests.errors.headcount')
    expect(validateRequestForm({ ...valid, headcount: '' }).headcount).toBe('jobRequests.errors.headcount')
    expect(validateRequestForm({ ...valid, headcount: '1.5' }).headcount).toBe('jobRequests.errors.headcount')
    expect(validateRequestForm({ ...valid, headcount: '101' }).headcount).toBe('jobRequests.errors.headcount')
  })

  it('keeps the minimum at or below the maximum', () => {
    expect(validateRequestForm({ ...valid, salaryMin: '70000' }).salaryMax).toBe('jobRequests.errors.salaryOrder')
    expect(validateRequestForm({ ...valid, salaryMin: '60000' })).toEqual({})
  })

  it('checks the desired date shape', () => {
    expect(validateRequestForm({ ...valid, desiredStart: '2026-12-01' })).toEqual({})
    expect(validateRequestForm({ ...valid, desiredStart: '01/12/2026' }).desiredStart).toBe('jobRequests.errors.desiredStart')
  })

  it('turns the form into the wire input, leaving empty optionals out', () => {
    expect(toRequestInput(valid, 'it')).toEqual({
      title: 'Backend developer',
      role: 'backend_developer',
      reason: 'Servono due persone.',
      headcount: 2,
      salaryMin: 45000,
      salaryMax: 60000,
      currency: 'EUR',
      language: 'it',
      location: {},
      processNotes: '',
      interviewersNotes: '',
    })
    expect(toRequestInput({ ...valid, workMode: 'hybrid', location: ' Milano ', desiredStart: '2026-12-01', processNotes: ' due colloqui ', interviewersNotes: 'Marta' }, 'en')).toMatchObject({
      language: 'en',
      workMode: 'hybrid',
      location: { city: 'Milano' },
      desiredStart: '2026-12-01',
      processNotes: 'due colloqui',
      interviewersNotes: 'Marta',
    })
  })
})

describe('requestLanguage', () => {
  it('sends the screen language the platform supports, the default otherwise', () => {
    expect(requestLanguage('en')).toBe('en')
    expect(requestLanguage('it')).toBe('it')
    expect(requestLanguage('de')).toBe('it')
  })
})
