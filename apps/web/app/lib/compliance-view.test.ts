import { describe, expect, it } from 'vitest'
import { complianceMarks, complianceView } from './compliance-view'
import { checkForm, emptyForm, type JobForm } from './job-form'

const form = (overrides: Partial<JobForm> = {}): JobForm => ({ ...emptyForm(), ...overrides })

describe('compliance in the editor', () => {
  it('turns a masculine-only title into a blocking item with fixes, and keeps it out of the gaps count', () => {
    const f = form({ title: 'Sviluppatore backend' })
    const check = checkForm(f)
    expect(check.publishable).toBe(false)
    const view = complianceView(f, check.issues, check.warnings)
    expect(view.blocking).toHaveLength(1)
    const [item] = view.blocking
    expect(item).toMatchObject({ rule: 'gender_exclusive_title', path: 'title', fieldId: 'job-field-title', match: 'Sviluppatore', blocking: true, messageKey: 'job.compliance.rules.gender_exclusive_title' })
    expect(item?.fixes[0]?.patch).toEqual({ title: 'Sviluppatore backend (m/f)' })
  })

  it('blocks an age limit in the requirements, with the offending text and its removal', () => {
    const f = form({ title: 'Backend developer (m/f)', mustHave: ['Node.js', 'Età massima 35 anni'] })
    const check = checkForm(f)
    const view = complianceView(f, check.issues, check.warnings)
    const age = view.blocking.find((item) => item.path === 'requirements.mustHave.1')
    expect(age?.rule).toBe('discriminatory_requirement')
    expect(age?.match.toLowerCase()).toContain('massima')
    expect(age?.fixes[0]?.patch).toEqual({ mustHave: ['Node.js'] })
  })

  it('lists doubtful wording as warnings, never blocking', () => {
    const f = form({ title: 'Backend developer', summary: 'Il candidato ideale sarà inserito nel team.' })
    const check = checkForm(f)
    const view = complianceView(f, check.issues, check.warnings)
    expect(view.blocking).toEqual([])
    expect(view.warnings.map((item) => item.rule)).toContain('gender_masculine_phrasing')
    expect(complianceMarks(view).map((mark) => mark.text)).toContain(view.warnings[0]?.match)
  })

  it('skips findings without details (an older api) and marks blocking ones first', () => {
    const view = complianceView(form(), [{ path: 'title', rule: 'gender_exclusive_title' }, { path: 'role', rule: 'required' }], [])
    expect(view.blocking).toEqual([])
    const marks = complianceMarks({
      blocking: [{ key: 'b', rule: 'r', path: 'title', fieldId: 'f', blocking: true, match: 'x', suggestion: '', messageKey: 'k', fixes: [] }],
      warnings: [{ key: 'w', rule: 'r', path: 'title', fieldId: 'f', blocking: false, match: ' ', suggestion: '', messageKey: 'k', fixes: [] }],
    })
    expect(marks.map((mark) => mark.item.key)).toEqual(['b'])
  })
})
