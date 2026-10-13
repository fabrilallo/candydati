import { jobContentSchema } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { completeContent } from '~~/test/fixtures/job-fixtures'
import { contentToForm, emptyForm } from './job-form'
import { applyJobProposal, proposalFacts } from './job-proposal'

describe('applyJobProposal', () => {
  it('fills an empty form with the whole proposal', () => {
    expect(applyJobProposal(emptyForm('it'), completeContent)).toEqual(contentToForm(completeContent))
  })

  it('keeps what the proposal leaves empty and never touches the input', () => {
    const current = { ...emptyForm('it'), city: 'Torino', benefits: ['Smart working'], summary: 'Già scritto' }
    const proposal = jobContentSchema.parse({ title: 'Data engineer', summary: 'Nuovo riassunto', responsibilities: ['A', 'B', 'C'] })
    const next = applyJobProposal(current, proposal)
    expect(next).toMatchObject({ title: 'Data engineer', summary: 'Nuovo riassunto', city: 'Torino', benefits: ['Smart working'], responsibilities: ['A', 'B', 'C'] })
    expect(current.title).toBe('')
  })

  it('keeps the id of a saved stage only at the same place with the same type', () => {
    const saved = contentToForm(jobContentSchema.parse({ ...completeContent, process: completeContent.process.map((stage, index) => ({ ...stage, id: `s${index}` })) }))
    const proposal = jobContentSchema.parse({
      title: 'Backend developer',
      process: [
        { type: 'screening_call', durationMinutes: 20, conductedBy: 'recruiter' },
        { type: 'take_home_assignment', durationMinutes: 120, conductedBy: 'technical_lead' },
        { type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
      ],
    })
    const next = applyJobProposal(saved, proposal)
    expect(next.process.map((stage) => [stage.id, stage.type, stage.durationMinutes])).toEqual([
      ['s0', 'screening_call', '20'],
      ['', 'take_home_assignment', '120'],
      ['', 'technical_interview', '60'],
    ])
  })
})

describe('proposalFacts', () => {
  it('summarises a proposal for the card', () => {
    expect(proposalFacts(completeContent)).toEqual({ title: 'Backend developer', salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' }, city: 'Milano', stages: 2, responsibilities: 3 })
    expect(proposalFacts(jobContentSchema.parse({ title: 'X' }))).toEqual({ title: 'X', salary: null, city: null, stages: 0, responsibilities: 0 })
  })
})
