import { describe, expect, it } from 'vitest'
import {
  conversionOf,
  dailySeries,
  filterChoices,
  matchesSource,
  parseSourceFilter,
  sourceFilterOf,
  sourceSummaries,
  trafficPeriod,
  trafficQuery,
  trafficTotals,
} from './traffic-view'

const row = (day: string, origin: string, campaign: string, visits: number, applications: number) => ({ day, origin, campaign, visits, applications })
const ROWS = [
  row('2026-10-26', 'linkedin', 'autumn', 10, 2),
  row('2026-10-26', 'linkedin', '', 4, 1),
  row('2026-10-27', 'direct', '', 3, 0),
  row('2026-10-28', 'linkedin', 'autumn', 6, 1),
]

describe('trafficPeriod', () => {
  it('ends on the UTC day of today and counts both ends', () => {
    expect(trafficPeriod(7, new Date('2026-10-28T23:30:00Z'))).toEqual({ from: '2026-10-22', to: '2026-10-28' })
    expect(trafficPeriod(30, new Date('2026-03-01T01:00:00Z'))).toEqual({ from: '2026-01-31', to: '2026-03-01' })
  })

  it('asks the api for whole UTC days', () => {
    expect(trafficQuery({ from: '2026-10-22', to: '2026-10-28' })).toBe('from=2026-10-22T00%3A00%3A00.000Z&to=2026-10-28T23%3A59%3A59.999Z')
  })
})

describe('source filter', () => {
  it('reads all sources, one source with every campaign, or one exact link', () => {
    expect(parseSourceFilter('')).toBeNull()
    expect(parseSourceFilter('linkedin')).toEqual({ origin: 'linkedin', campaign: null })
    expect(parseSourceFilter('linkedin|autumn')).toEqual({ origin: 'linkedin', campaign: 'autumn' })
    expect(parseSourceFilter('linkedin|')).toEqual({ origin: 'linkedin', campaign: '' })
    expect(sourceFilterOf({ origin: 'linkedin', campaign: '' })).toBe('linkedin|')
    expect(sourceFilterOf({ origin: 'linkedin', campaign: null })).toBe('linkedin')
    expect(sourceFilterOf(null)).toBe('')
  })

  it('matches rows and applications the same way', () => {
    expect(ROWS.filter((r) => matchesSource(r, null))).toHaveLength(4)
    expect(ROWS.filter((r) => matchesSource(r, { origin: 'linkedin', campaign: null }))).toHaveLength(3)
    expect(ROWS.filter((r) => matchesSource(r, { origin: 'linkedin', campaign: '' }))).toHaveLength(1)
    expect(matchesSource({ origin: 'linkedin', campaign: null }, { origin: 'linkedin', campaign: '' })).toBe(true)
    expect(matchesSource({ origin: 'linkedin', campaign: 'autumn' }, { origin: 'linkedin', campaign: 'autumn' })).toBe(true)
  })
})

describe('dailySeries', () => {
  it('has one point per day of the period, zeros included, for the chosen source', () => {
    const series = dailySeries(ROWS, { origin: 'linkedin', campaign: null }, { from: '2026-10-25', to: '2026-10-28' }, 'it')
    expect(series.map((p) => [p.day, p.visits, p.applications])).toEqual([
      ['2026-10-25', 0, 0],
      ['2026-10-26', 14, 3],
      ['2026-10-27', 0, 0],
      ['2026-10-28', 6, 1],
    ])
    expect(series.map((p) => p.index)).toEqual([0, 1, 2, 3])
    expect(series[1]!.label).toBe('26 ott')
  })
})

describe('trafficTotals and conversionOf', () => {
  it('adds up the period', () => {
    expect(trafficTotals(dailySeries(ROWS, null, { from: '2026-10-26', to: '2026-10-28' }, 'en'))).toMatchObject({ visits: 23, applications: 4 })
  })

  it('gives applications per 100 visits only from the fifth visit', () => {
    expect(conversionOf(0, 0)).toEqual({ state: 'no_visits', per100: null })
    expect(conversionOf(1, 1)).toEqual({ state: 'few_visits', per100: null })
    expect(conversionOf(1, 4)).toEqual({ state: 'few_visits', per100: null })
    expect(conversionOf(1, 5)).toEqual({ state: 'ok', per100: 20 })
    expect(conversionOf(4, 23)).toEqual({ state: 'ok', per100: 17 })
  })

  it('keeps a figure over 100: not every applicant is counted as a visit', () => {
    expect(conversionOf(6, 5)).toEqual({ state: 'ok', per100: 120 })
  })
})

describe('sourceSummaries', () => {
  it('sums each source and its campaigns, most applications first', () => {
    expect(sourceSummaries(ROWS)).toEqual([
      {
        origin: 'linkedin',
        visits: 20,
        applications: 4,
        conversion: { state: 'ok', per100: 20 },
        campaigns: [{ campaign: 'autumn', visits: 16, applications: 3, conversion: { state: 'ok', per100: 19 } }],
      },
      { origin: 'direct', visits: 3, applications: 0, conversion: { state: 'few_visits', per100: null }, campaigns: [] },
    ])
  })
})

describe('filterChoices', () => {
  it('lists the saved links first, then each source and its campaigns, each value once', () => {
    const choices = filterChoices(sourceSummaries(ROWS), [{ source: 'linkedin', campaign: 'autumn' }, { source: 'indeed', campaign: '' }])
    expect(choices.map((c) => [c.value, c.kind])).toEqual([
      ['linkedin|autumn', 'link'],
      ['indeed|', 'link'],
      ['linkedin', 'source'],
      ['direct', 'source'],
    ])
  })
})
