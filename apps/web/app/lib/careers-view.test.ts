import type { PublicJobSummaryDto } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { careersStats, filterCareers, groupCareers, workModesOf } from './careers-view'

const job = (slug: string, role: PublicJobSummaryDto['role'], workMode: PublicJobSummaryDto['workMode'], over: Partial<PublicJobSummaryDto> = {}): PublicJobSummaryDto => ({
  slug,
  title: slug,
  role,
  seniority: 'senior',
  contractType: 'permanent',
  workMode,
  location: { country: 'IT', city: 'Milano' },
  salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
  stageCount: 3,
  responseDays: 5,
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

const jobs = [
  job('a', 'backend_developer', 'hybrid', { publishedAt: '2026-10-02T00:00:00.000Z', responseDays: 3 }),
  job('b', 'product_designer', 'remote', { responseDays: 7 }),
  job('c', 'frontend_developer', 'remote', { publishedAt: '2026-10-05T00:00:00.000Z' }),
  job('d', 'account_executive', 'onsite'),
]

describe('groupCareers', () => {
  it('groups by role family, biggest group first, newest ad first inside', () => {
    const groups = groupCareers(jobs)
    expect(groups.map((g) => [g.family, g.jobs.map((j) => j.slug)])).toEqual([
      ['engineering', ['c', 'a']],
      ['design', ['b']],
      ['sales', ['d']],
    ])
  })

  it('puts custom roles in their own group', () => {
    const groups = groupCareers([job('x', 'other', 'remote'), job('y', 'backend_developer', 'remote')])
    expect(groups.map((g) => g.family).sort()).toEqual(['engineering', 'other'])
  })

  it('is empty for no jobs and does not mutate the input', () => {
    expect(groupCareers([])).toEqual([])
    const copy = [...jobs]
    groupCareers(jobs)
    expect(jobs).toEqual(copy)
  })
})

describe('filterCareers', () => {
  it('filters by work mode and family, null means everything', () => {
    expect(filterCareers(jobs, { workMode: null, family: null })).toHaveLength(4)
    expect(filterCareers(jobs, { workMode: 'remote', family: null }).map((j) => j.slug)).toEqual(['b', 'c'])
    expect(filterCareers(jobs, { workMode: 'remote', family: 'engineering' }).map((j) => j.slug)).toEqual(['c'])
  })
})

describe('workModesOf', () => {
  it('lists the modes that exist with counts, in taxonomy order', () => {
    expect(workModesOf(jobs)).toEqual([
      { workMode: 'remote', count: 2 },
      { workMode: 'hybrid', count: 1 },
      { workMode: 'onsite', count: 1 },
    ])
  })
})

describe('careersStats', () => {
  it('reports the count and the slowest promised answer', () => {
    expect(careersStats(jobs)).toEqual({ openCount: 4 })
  })

  it('has no response promise without jobs', () => {
    expect(careersStats([])).toEqual({ openCount: 0 })
  })
})
