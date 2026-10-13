import { describe, expect, it } from 'vitest'
import { emptyJobStats, jobStatsFixture } from '../../test/fixtures/job-stats'
import {
  blockerLabel,
  compactMoney,
  formatDecimal,
  hasActivity,
  qualityRows,
  salaryView,
  statusSlices,
  weekLabel,
  weeklySeries,
} from './stats-view'

describe('weekLabel', () => {
  it('formats the monday of the week as a short day and month, in UTC', () => {
    expect(weekLabel('2026-10-05', 'it')).toBe('5 ott')
    expect(weekLabel('2026-10-05', 'en')).toBe('5 Oct')
  })
})

describe('weeklySeries', () => {
  it('keeps the order and adds an index and a label', () => {
    const series = weeklySeries(jobStatsFixture().weekly, 'it')
    expect(series).toHaveLength(12)
    expect(series[0]).toEqual({ index: 0, label: '20 lug', created: 0, published: 1 })
    expect(series.map((point) => point.index)).toEqual([...Array(12).keys()])
  })
})

describe('hasActivity', () => {
  it('is false when every week is empty', () => {
    expect(hasActivity(emptyJobStats().weekly)).toBe(false)
    expect(hasActivity(jobStatsFixture().weekly)).toBe(true)
  })
})

describe('statusSlices', () => {
  it('lists the three statuses in a fixed order and drops nothing', () => {
    expect(statusSlices(jobStatsFixture().statusCounts)).toEqual([
      { status: 'published', value: 3 },
      { status: 'draft', value: 2 },
      { status: 'closed', value: 1 },
    ])
  })
})

describe('salaryView', () => {
  it('charts the largest currency and period group and counts the others', () => {
    const view = salaryView(jobStatsFixture().salary)
    expect(view.group).toEqual({ currency: 'EUR', period: 'year', count: 2, medianMin: 42500, medianMax: 56000 })
    expect(view.items.map((item) => item.id)).toEqual(['j1', 'j3'])
    expect(view.items[0]).toMatchObject({ index: 0, span: 12000 })
    expect(view.otherCount).toBe(1)
  })

  it('is empty without published ads', () => {
    expect(salaryView(emptyJobStats().salary)).toEqual({ group: null, items: [], otherCount: 0 })
  })
})

describe('qualityRows', () => {
  it('adds an index for the chart and keeps the order', () => {
    expect(qualityRows(jobStatsFixture().quality.items).map((row) => [row.index, row.id])).toEqual([
      [0, 'j3'],
      [1, 'j1'],
      [2, 'j2'],
    ])
  })
})

describe('blockerLabel', () => {
  it('names the missing field for required values and the rule otherwise', () => {
    expect(blockerLabel({ rule: 'required', path: 'salary.min', drafts: 1 })).toEqual({ key: 'dashboard.stats.readiness.missing', fieldKey: 'job.fields.salary.min' })
    expect(blockerLabel({ rule: 'too_few_stages', path: 'process', drafts: 1 })).toEqual({ key: 'dashboard.stats.readiness.rules.too_few_stages', fieldKey: null })
  })
})

describe('number formats', () => {
  it('formats decimals in the locale and money compactly', () => {
    expect(formatDecimal(4.3, 'it')).toBe('4,3')
    expect(formatDecimal(4, 'en')).toBe('4')
    expect(compactMoney(42500, 'EUR', 'it')).toMatch(/42,5\s?k/i)
    expect(compactMoney(56000, 'EUR', 'en')).toBe('€56k')
  })
})

describe('chart helpers', () => {
  it('escapes user text for tooltips and keeps integer ticks only', async () => {
    const { escapeHtml, integerTick } = await import('./stats-view')
    expect(escapeHtml('<b>"R&D"</b>')).toBe('&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt;')
    expect(integerTick(2)).toBe('2')
    expect(integerTick(0.5)).toBe('')
    expect(integerTick(new Date(0))).toBe('')
  })

  it('shortens long titles for an axis', async () => {
    const { shortTitle } = await import('./stats-view')
    expect(shortTitle('Data Analyst')).toBe('Data Analyst')
    expect(shortTitle('Senior Backend Developer (Node.js)')).toBe('Senior Backend Develo…')
  })
})
