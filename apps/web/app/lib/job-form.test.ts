import { describe, expect, it } from 'vitest'
import { appendItem, checkForm, contentToForm, emptyForm, emptyStage, formToInput, isCompleteStage, moveItem, removeItem, replaceItem, snapshotOf, validateForm, type JobForm } from './job-form'

const complete: JobForm = {
  ...emptyForm('en'),
  title: 'Backend developer',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salaryMin: '45000',
  salaryMax: '60000',
  workMode: 'hybrid',
  country: 'IT',
  city: 'Milano',
  onsiteDaysPerWeek: '2',
  process: [{ type: 'screening_call', durationMinutes: '30', conductedBy: 'recruiter', note: ' intro ' }],
  responseDays: '5',
  responsibilities: ['a', ' b ', '', 'c'],
  mustHave: ['TypeScript'],
}

describe('validateForm', () => {
  it('accepts a draft with only a title', () => {
    const result = validateForm({ ...emptyForm(), title: 'Idea' })
    expect(result.errors).toEqual({})
    expect(result.content?.title).toBe('Idea')
    expect(result.content?.salary).toEqual({ currency: 'EUR', period: 'year' })
  })

  it('requires the title', () => {
    expect(validateForm(emptyForm()).errors).toEqual({ title: 'validation.required' })
    expect(validateForm({ ...emptyForm(), title: '   ' }).content).toBeNull()
  })

  it('turns the form into trimmed, typed content', () => {
    const { content } = validateForm(complete)
    expect(content?.salary).toEqual({ min: 45000, max: 60000, currency: 'EUR', period: 'year' })
    expect(content?.responsibilities).toEqual(['a', 'b', 'c'])
    expect(content?.process).toEqual([{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter', note: 'intro' }])
    expect(content?.location).toEqual({ country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 })
  })

  it('drops city and on-site days for remote work but keeps them in the form', () => {
    const remote = { ...complete, workMode: 'remote' }
    expect(validateForm(remote).content?.location).toEqual({ country: 'IT' })
    expect(remote.city).toBe('Milano')
  })

  it('reports numbers the schema rejects, by field path', () => {
    const { errors } = validateForm({ ...complete, salaryMin: '45.5', responseDays: 'abc' })
    expect(errors['salary.min']).toBe('job.validation.invalidValue')
    expect(errors.responseDays).toBe('job.validation.invalidValue')
  })

  it('reports an incomplete stage on the process field and ignores blank ones', () => {
    const half = { ...complete, process: [...complete.process, { ...emptyStage(), type: 'offer' }] }
    expect(validateForm(half).errors).toEqual({ process: 'job.validation.stageIncomplete' })
    const blank = { ...complete, process: [...complete.process, emptyStage()] }
    expect(validateForm(blank).content?.process).toHaveLength(1)
  })
})

describe('contentToForm', () => {
  it('round-trips through the form', () => {
    const { content } = validateForm(complete)
    expect(content).not.toBeNull()
    const back = contentToForm(content!)
    expect(validateForm(back).content).toEqual(content)
    expect(back.salaryMin).toBe('45000')
    expect(back.process[0]?.note).toBe('intro')
  })

  it('uses empty strings for missing optional values', () => {
    const { content } = validateForm({ ...emptyForm(), title: 'x' })
    expect(contentToForm(content!)).toEqual({ ...emptyForm(), title: 'x' })
  })
})

describe('stages and lists', () => {
  it('knows when a stage is complete', () => {
    expect(isCompleteStage(emptyStage())).toBe(false)
    expect(isCompleteStage({ type: 'offer', durationMinutes: '10', conductedBy: 'founder', note: '' })).toBe(true)
  })

  it('updates lists without mutating them', () => {
    const list = Object.freeze(['a', 'b', 'c'])
    expect(appendItem(list, 'd')).toEqual(['a', 'b', 'c', 'd'])
    expect(removeItem(list, 1)).toEqual(['a', 'c'])
    expect(replaceItem(list, 0, 'z')).toEqual(['z', 'b', 'c'])
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('leaves out-of-range moves alone', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, 5, 1)).toBe(list)
  })
})

describe('snapshotOf / formToInput', () => {
  it('changes when the form changes', () => {
    expect(snapshotOf(complete)).toBe(snapshotOf({ ...complete }))
    expect(snapshotOf(complete)).not.toBe(snapshotOf({ ...complete, title: 'Other' }))
  })

  it('leaves blank optional values undefined', () => {
    const input = formToInput(emptyForm())
    expect(input.role).toBeUndefined()
    expect(input.responseDays).toBeUndefined()
  })
})

describe('checkForm', () => {
  it('lists what is missing on an empty form, title included', () => {
    const { issues, publishable } = checkForm(emptyForm())
    expect(publishable).toBe(false)
    expect(issues[0]).toEqual({ path: 'title', rule: 'required' })
    expect(issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['role', 'salary.min', 'salary.max', 'process', 'responsibilities', 'requirements.mustHave']))
  })

  it('is publishable once every rule holds', () => {
    const ready = { ...complete, responsibilities: ['a', 'b', 'c'] }
    expect(checkForm(ready)).toEqual({ issues: [], errors: {}, publishable: true })
  })

  it('reports rule violations live', () => {
    const { issues } = checkForm({ ...complete, responsibilities: ['a', 'b', 'c'], salaryMax: '100', city: '' })
    expect(issues).toEqual([
      { path: 'salary.max', rule: 'salary_max_below_min' },
      { path: 'location.city', rule: 'city_required' },
    ])
  })

  it('ignores incomplete stages for the rules but blocks on them', () => {
    const half = { ...complete, responsibilities: ['a', 'b', 'c'], process: [{ ...emptyStage(), type: 'offer' }] }
    const check = checkForm(half)
    expect(check.issues).toEqual([{ path: 'process', rule: 'too_few_stages' }])
    expect(check.errors).toEqual({ process: 'job.validation.stageIncomplete' })
    expect(check.publishable).toBe(false)
  })

  it('is not publishable with a malformed number even if the rules hold', () => {
    const check = checkForm({ ...complete, responsibilities: ['a', 'b', 'c'], responseDays: '1.5' })
    expect(check.publishable).toBe(false)
  })
})
