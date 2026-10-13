import { describe, expect, it } from 'vitest'
import { blockedStageIds, describeIssues, fieldIdOf, issueKeysByPath } from './job-issues'

describe('job issues', () => {
  it('maps content paths to field ids', () => {
    expect(fieldIdOf('role')).toBe('job-field-role')
    expect(fieldIdOf('salary.max')).toBe('job-field-salary-max')
    expect(fieldIdOf('requirements.mustHave')).toBe('job-field-requirements-mustHave')
  })

  it('describes each issue with translation keys and its field', () => {
    const [view] = describeIssues([{ path: 'location.city', rule: 'city_required' }])
    expect(view).toEqual({ path: 'location.city', rule: 'city_required', fieldId: 'job-field-location-city', labelKey: 'job.fields.location.city', messageKey: 'job.rules.city_required' })
  })

  it('keeps the first message per path', () => {
    const keys = issueKeysByPath([
      { path: 'salary.max', rule: 'required' },
      { path: 'salary.max', rule: 'salary_max_below_min' },
      { path: 'role', rule: 'required' },
    ])
    expect(keys).toEqual({ 'salary.max': 'job.rules.required', role: 'job.rules.required' })
  })
})

describe('blockedStageIds', () => {
  it('collects the stages refused because they hold open applications', () => {
    const issues = [
      { path: 'process', message: 'stage_has_open_applications:stg-a' },
      { path: 'process', message: 'stage_has_open_applications:stg-b' },
      { path: 'process', message: 'duplicate_stage_id:x' },
      { path: 'salary.min', message: 'stage_has_open_applications:nope' },
    ]
    expect([...blockedStageIds(issues)]).toEqual(['stg-a', 'stg-b'])
    expect(blockedStageIds([]).size).toBe(0)
  })
})
