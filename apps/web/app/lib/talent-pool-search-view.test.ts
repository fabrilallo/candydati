import { describe, expect, it } from 'vitest'
import { candidateCriteriaSchema } from '@candydati/domain'
import { hasTalentCriteria, talentCriteriaFromJob, talentQuery } from './talent-pool-search-view'

describe('the talent pool search of a job', () => {
  it('prefills the first technologies of the ad and its city', () => {
    expect(talentCriteriaFromJob({ technologies: ['Go', 'Kubernetes', 'Postgres', 'Redis', 'gRPC', 'Kafka'], city: 'Milano' })).toEqual({
      skills: 'Go, Kubernetes, Postgres', languages: '', minYears: '', location: 'Milano', keywords: '',
    })
    expect(talentCriteriaFromJob({ technologies: [], city: null })).toEqual({ skills: '', languages: '', minYears: '', location: '', keywords: '' })
  })

  it('turns the form into criteria the api accepts, leaving out what is empty', () => {
    const query = talentQuery({ skills: ' Go, Go , Kubernetes', languages: 'Inglese', minYears: '3', location: 'Milano, Torino', keywords: '' })
    expect(query).toEqual({ skills: ['Go', 'Kubernetes'], languages: ['Inglese'], locations: ['Milano', 'Torino'], keywords: [], minYearsOfExperience: 3 })
    expect(candidateCriteriaSchema.safeParse(query).success).toBe(true)
    expect(talentQuery({ skills: '', languages: '', minYears: 'x', location: '', keywords: 'fintech' })).toEqual({ skills: [], languages: [], locations: [], keywords: ['fintech'] })
  })

  it('needs at least one criterion', () => {
    expect(hasTalentCriteria(talentQuery({ skills: '', languages: '', minYears: '', location: '', keywords: '' }))).toBe(false)
    expect(hasTalentCriteria(talentQuery({ skills: '', languages: '', minYears: '0', location: '', keywords: '' }))).toBe(true)
  })
})
