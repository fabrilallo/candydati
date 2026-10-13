import { describe, expect, it } from 'vitest'
import { gapList, gapsBySlot, optionalHints, visibleIssueErrors } from './ad-gaps'

describe('gapsBySlot', () => {
  it('groups issues by the place where the ad shows them, first issue wins', () => {
    const gaps = gapsBySlot([
      { path: 'salary.min', rule: 'required' },
      { path: 'salary.max', rule: 'required' },
      { path: 'location.city', rule: 'city_required' },
      { path: 'location.onsiteDaysPerWeek', rule: 'onsite_days_required' },
      { path: 'requirements.mustHave', rule: 'too_few_requirements' },
    ])
    expect(gaps.salary).toEqual({ slot: 'salary', fieldId: 'job-field-salary-min', messageKey: 'job.preview.gaps.salary' })
    expect(gaps.place).toEqual({ slot: 'place', fieldId: 'job-field-location-city', messageKey: 'job.rules.city_required' })
    expect(gaps.mustHave?.messageKey).toBe('job.rules.too_few_requirements')
    expect(gaps.role).toBeUndefined()
  })

  it('names a range inconsistency with its rule, pointing at the max field', () => {
    expect(gapsBySlot([{ path: 'salary.max', rule: 'salary_max_below_min' }]).salary).toEqual({
      slot: 'salary',
      fieldId: 'job-field-salary-max',
      messageKey: 'job.rules.salary_max_below_min',
    })
  })

  it('names the missing bound when only one is missing', () => {
    expect(gapsBySlot([{ path: 'salary.max', rule: 'required' }]).salary?.messageKey).toBe('job.preview.gaps.salaryMax')
    expect(gapsBySlot([{ path: 'salary.min', rule: 'required' }]).salary?.messageKey).toBe('job.preview.gaps.salaryMin')
  })

  it('ignores paths the ad does not know', () => {
    expect(gapsBySlot([{ path: 'mystery', rule: 'required' }])).toEqual({})
  })
})

describe('gapList', () => {
  it('lists one gap per slot in the order of the form', () => {
    const list = gapList([
      { path: 'requirements.mustHave', rule: 'too_few_requirements' },
      { path: 'salary.max', rule: 'required' },
      { path: 'title', rule: 'required' },
      { path: 'salary.min', rule: 'required' },
    ])
    expect(list.map((gap) => gap.slot)).toEqual(['title', 'salary', 'mustHave'])
  })
})

describe('optionalHints', () => {
  it('returns the empty optional sections with the field to fill', () => {
    const hints = optionalHints({ summary: '', niceToHave: ['x'], technologies: [], benefits: [], growth: 'ok', workLifeBalance: ' ', culture: '' })
    expect(hints.map((hint) => hint.key)).toEqual(['summary', 'technologies', 'benefits', 'workLifeBalance', 'culture'])
    expect(hints[0]).toEqual({ key: 'summary', fieldId: 'job-field-summary', messageKey: 'job.preview.optional.summary' })
  })
})

describe('visibleIssueErrors', () => {
  const issues = [
    { path: 'title', rule: 'required' as const },
    { path: 'salary.max', rule: 'salary_max_below_min' as const },
    { path: 'responsibilities', rule: 'too_few_responsibilities' as const },
  ]

  it('stays quiet on a fresh draft except for a range that contradicts itself', () => {
    expect(visibleIssueErrors({ issues, touched: new Set(), attempted: false })).toEqual({ 'salary.max': 'job.rules.salary_max_below_min' })
  })

  it('shows the rule of a field once the user has left it', () => {
    expect(visibleIssueErrors({ issues, touched: new Set(['job-field-responsibilities']), attempted: false })).toEqual({
      'salary.max': 'job.rules.salary_max_below_min',
      responsibilities: 'job.rules.too_few_responsibilities',
    })
  })

  it('shows every rule after a publish attempt', () => {
    expect(Object.keys(visibleIssueErrors({ issues, touched: new Set(), attempted: true }))).toEqual(['title', 'salary.max', 'responsibilities'])
  })
})
