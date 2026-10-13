import { jobContentSchema } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { translatorFor } from '~~/test/fixtures/ad-translate'
import { templateFacts, templateSummary } from './template-summary'

const full = jobContentSchema.parse({
  title: 'Backend developer',
  salary: { min: 45000, max: 60000 },
  process: [
    { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
    { type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
    { type: 'team_interview', durationMinutes: 45, conductedBy: 'founder' },
  ],
  responseDays: 5,
  responsibilities: ['a', 'b', 'c'],
  requirements: { mustHave: ['a', 'b', 'c'], niceToHave: ['d', 'e'] },
  benefits: ['x'],
})

describe('templateFacts', () => {
  it('counts what the template pre-fills', () => {
    expect(templateFacts(full)).toEqual([
      { key: 'salary', count: 0 },
      { key: 'stages', count: 3 },
      { key: 'requirements', count: 5 },
      { key: 'responsibilities', count: 3 },
      { key: 'benefits', count: 1 },
    ])
  })

  it('is empty for a title-only template', () => {
    expect(templateFacts(jobContentSchema.parse({ title: 'Vuoto' }))).toEqual([])
  })

  it('treats a single salary bound as salary', () => {
    expect(templateFacts(jobContentSchema.parse({ title: 'x', salary: { min: 30000 } }))).toEqual([{ key: 'salary', count: 0 }])
  })
})

describe('templateSummary', () => {
  it('reads as one short line', () => {
    expect(templateSummary(full, translatorFor('it'))).toBe('RAL, processo in 3 fasi, 5 requisiti, 3 attività, 1 benefit')
  })

  it('uses singular forms', () => {
    const one = jobContentSchema.parse({ title: 'x', process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }], requirements: { mustHave: ['a'] } })
    expect(templateSummary(one, translatorFor('it'))).toBe('processo in 1 fase, 1 requisito')
  })

  it('says so when nothing is pre-filled', () => {
    expect(templateSummary(jobContentSchema.parse({ title: 'x' }), translatorFor('it'))).toBe('Solo il titolo')
  })
})
