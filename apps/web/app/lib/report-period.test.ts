import { describe, expect, it } from 'vitest'
import { checkCustomPeriod, isoDay, PERIOD_PRESETS, presetPeriod, reportsQuery } from './report-period'

const today = new Date(2026, 9, 13, 15, 30)

describe('isoDay', () => {
  it('writes the local calendar day', () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('presetPeriod', () => {
  it('counts the last N days including today', () => {
    expect(presetPeriod('last30', today)).toEqual({ from: '2026-09-14', to: '2026-10-13' })
    expect(presetPeriod('last90', today)).toEqual({ from: '2026-07-16', to: '2026-10-13' })
    expect(presetPeriod('last365', today)).toEqual({ from: '2025-10-14', to: '2026-10-13' })
  })

  it('offers the three presets and the custom range, in order', () => {
    expect(PERIOD_PRESETS).toEqual(['last30', 'last90', 'last365', 'custom'])
  })
})

describe('checkCustomPeriod', () => {
  it('accepts a range that ends today or earlier', () => {
    expect(checkCustomPeriod('2026-01-01', '2026-03-31', today)).toEqual({ ok: true, period: { from: '2026-01-01', to: '2026-03-31' } })
    expect(checkCustomPeriod('2026-10-13', '2026-10-13', today)).toEqual({ ok: true, period: { from: '2026-10-13', to: '2026-10-13' } })
  })

  it('asks for both dates', () => {
    expect(checkCustomPeriod('', '2026-03-31', today)).toEqual({ ok: false, key: 'reports.period.errors.missing' })
    expect(checkCustomPeriod('2026-02-30', '2026-03-31', today)).toEqual({ ok: false, key: 'reports.period.errors.missing' })
  })

  it('refuses a start after the end and an end in the future', () => {
    expect(checkCustomPeriod('2026-04-01', '2026-03-31', today)).toEqual({ ok: false, key: 'reports.period.errors.order' })
    expect(checkCustomPeriod('2026-10-01', '2026-10-14', today)).toEqual({ ok: false, key: 'reports.period.errors.future' })
  })
})

describe('reportsQuery', () => {
  it('sends whole days as instants and the job only when chosen', () => {
    expect(reportsQuery({ from: '2026-09-14', to: '2026-10-13' }, null)).toBe('from=2026-09-14T00%3A00%3A00.000Z&to=2026-10-13T23%3A59%3A59.999Z')
    expect(reportsQuery({ from: '2026-09-14', to: '2026-10-13' }, 'job 1')).toContain('&jobId=job+1')
  })
})
