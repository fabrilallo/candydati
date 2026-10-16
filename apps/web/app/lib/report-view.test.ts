import { rate } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { emptyReportsFixture, reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import { formatDaysValue, formatRate, campaignRows, funnelRows, hasNoVisits, headlines, isReportEmpty, percentOf, responseTime, sourceRows, stageTypeRows, timeRows } from './report-view'

describe('percentOf', () => {
  it('rounds to a whole percentage', () => {
    expect(percentOf(rate(47, 50))).toBe(94)
    expect(percentOf(rate(2, 15))).toBe(13)
    expect(percentOf(rate(0, 5))).toBe(0)
  })

  it('has no percentage under five cases', () => {
    expect(percentOf(rate(4, 4))).toBeNull()
    expect(percentOf(rate(0, 0))).toBeNull()
  })
})

describe('formatting', () => {
  it('writes a percentage or a dash', () => {
    expect(formatRate(rate(47, 50), 'it')).toBe('94%')
    expect(formatRate(rate(1, 2), 'en')).toBe('—')
  })

  it('writes days with one decimal at most, or a dash', () => {
    expect(formatDaysValue(12.25, 'it')).toBe('12,3')
    expect(formatDaysValue(null, 'it')).toBe('—')
  })

  it('reads response times in hours under two days, in days above', () => {
    expect(responseTime(30.4)).toEqual({ unit: 'hours', value: 30 })
    expect(responseTime(60)).toEqual({ unit: 'days', value: 2.5 })
    expect(responseTime(null)).toBeNull()
  })
})

describe('headlines', () => {
  it('reads received applications from the first stage and keeps every rate with its counts', () => {
    const view = headlines(reportsFixture())
    expect(view.received).toBe(40)
    expect(view.timeToHire).toEqual({ count: 4, median: 24, p75: 31 })
    expect(view.responses).toEqual({ count: 47, total: 50, rate: 0.94 })
    expect(view.coverage).toEqual({ count: 18, total: 20, rate: 0.9 })
  })

  it('reads zero received when there is no funnel', () => {
    expect(headlines(emptyReportsFixture()).received).toBe(0)
  })
})

describe('funnelRows', () => {
  it('keeps the order of the api and scales bars on the widest stage', () => {
    const rows = funnelRows(reportsFixture().funnel.stages)
    expect(rows.map((row) => row.type)).toEqual(['received', 'screening_call', 'technical_interview', 'final_interview'])
    expect(rows.map((row) => row.width)).toEqual([100, 50, 25, 10])
    expect(rows[0]?.conversionToNext).toEqual({ count: 20, total: 40, rate: 0.5 })
    expect(rows[3]?.conversionToNext).toBeNull()
  })

  it('keeps bars at zero when nothing entered', () => {
    expect(funnelRows([{ position: 0, stageId: 'received', title: null, type: 'received', entered: 0, conversionToNext: null }])[0]?.width).toBe(0)
  })
})

describe('views with an invalid section', () => {
  it('reads a dash for the figures of a missing section and never counts it as empty', () => {
    const view = { ...reportsFixture(), funnel: null, responses: null }
    expect(headlines(view)).toMatchObject({ received: null, responses: null })
    expect(isReportEmpty({ ...emptyReportsFixture(), funnel: null })).toBe(false)
    expect(timeRows({ timeToHire: null, timeToFill: null })).toEqual({ max: 0, rows: [] })
  })
})

describe('sourceRows', () => {
  it('sorts by applications, scales on the largest and keeps hires with their rate', () => {
    const rows = sourceRows(reportsFixture().sources)
    expect(rows.map((row) => row.origin)).toEqual(['linkedin', 'direct', 'import', 'newsletter'])
    expect(rows[0]).toMatchObject({ applications: 20, hires: 2, width: 100, hireRate: { count: 2, total: 20 } })
    expect(percentOf(rows[3]!.hireRate)).toBeNull()
  })
})

describe('sourceRows with visits', () => {
  it('carries visits and the conversion with its denominator, which hides under the minimum sample', () => {
    const rows = sourceRows(reportsFixture().sources)
    expect(rows[0]).toMatchObject({ visits: 160, conversionRate: { count: 20, total: 160, rate: 0.125 } })
    expect(percentOf(rows[0]!.conversionRate)).toBe(13)
    expect(percentOf(rows.find((row) => row.origin === 'newsletter')!.conversionRate)).toBeNull()
    expect(percentOf(rows.find((row) => row.origin === 'import')!.conversionRate)).toBeNull()
  })

  it('breaks a tie on applications with the visits', () => {
    const base = { hires: 0, conversion: null }
    const rows = sourceRows([{ ...base, origin: 'a', applications: 2, visits: 1 }, { ...base, origin: 'b', applications: 2, visits: 9 }])
    expect(rows.map((row) => row.origin)).toEqual(['b', 'a'])
  })
})

describe('campaignRows and hasNoVisits', () => {
  it('keeps the order of the api and adds the conversion', () => {
    const rows = campaignRows(reportsFixture().campaigns)
    expect(rows.map((row) => row.campaign)).toEqual(['autumn', 'spring'])
    expect(rows[0]).toMatchObject({ conversionRate: { count: 14, total: 100, rate: 0.14 } })
  })

  it('knows when no source has a visit', () => {
    expect(hasNoVisits(reportsFixture().sources)).toBe(false)
    expect(hasNoVisits([{ origin: 'direct', applications: 3, hires: 0, visits: 0, conversion: null }])).toBe(true)
    expect(hasNoVisits([])).toBe(true)
  })
})

describe('stageTypeRows', () => {
  it('sums kept and missed, gives the kept share and sorts by volume', () => {
    const rows = stageTypeRows(reportsFixture().responses.byStageType)
    expect(rows[0]).toMatchObject({ type: 'received', kept: 30, missed: 2, total: 32, keptWidth: 94, missedWidth: 6 })
    expect(rows.at(-1)).toMatchObject({ type: 'final_interview', total: 0, keptWidth: 0, missedWidth: 0 })
  })
})

describe('timeRows', () => {
  it('joins time to hire and time to fill per job, with dot positions on a shared scale', () => {
    const view = timeRows(reportsFixture())
    expect(view.max).toBe(40)
    expect(view.rows.map((row) => row.jobId)).toEqual(['j1', 'j2', 'j3'])
    expect(view.rows[0]).toMatchObject({ title: 'Data Engineer', hires: 3, medianDays: 20, p75Days: 30, fillDays: 40, medianAt: 50, p75At: 75, fillAt: 100 })
    expect(view.rows[2]).toMatchObject({ jobId: 'j3', title: 'Product Designer', hires: 0, medianDays: null, medianAt: null, fillDays: 12, fillAt: 30 })
  })

  it('is empty without hires', () => {
    expect(timeRows(emptyReportsFixture())).toEqual({ max: 0, rows: [] })
  })
})

describe('isReportEmpty', () => {
  it('is true only when nothing at all happened in the period', () => {
    expect(isReportEmpty(reportsFixture())).toBe(false)
    expect(isReportEmpty(emptyReportsFixture())).toBe(true)
  })
})
