import { describe, expect, it } from 'vitest'
import { emptyForm } from './job-form'
import { canSuggestResponsibilities, responsibilityRequestOf, withResponsibilities } from './responsibility-suggestions'

describe('responsibility suggestions', () => {
  it('needs a title or a role', () => {
    expect(canSuggestResponsibilities(emptyForm())).toBe(false)
    expect(canSuggestResponsibilities({ ...emptyForm(), title: ' Dev ' })).toBe(true)
    expect(canSuggestResponsibilities({ ...emptyForm(), role: 'backend_developer' })).toBe(true)
  })

  it('sends the ad context and leaves empty fields out', () => {
    const form = { ...emptyForm('en'), title: ' Dev ', seniority: 'senior', responsibilities: ['Write code', ' '], summary: 'We build APIs.' }
    expect(responsibilityRequestOf(form)).toEqual({ title: 'Dev', seniority: 'senior', language: 'en', existing: ['Write code'], summary: 'We build APIs.' })
  })

  it('appends after what is written, drops empty rows and repeats', () => {
    expect(withResponsibilities(['Write code', ''], ['write code ', 'Review code'])).toEqual(['Write code', 'Review code'])
  })
})
