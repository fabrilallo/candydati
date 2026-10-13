import { describe, expect, it } from 'vitest'
import { noticeParagraphs, retentionCopy, retentionPeriod } from './consent-copy'

describe('retentionPeriod', () => {
  it('speaks in years and months when the days allow it', () => {
    expect(retentionPeriod(365)).toEqual({ unit: 'years', count: 1 })
    expect(retentionPeriod(730)).toEqual({ unit: 'years', count: 2 })
    expect(retentionPeriod(1825)).toEqual({ unit: 'years', count: 5 })
    expect(retentionPeriod(180)).toEqual({ unit: 'months', count: 6 })
    expect(retentionPeriod(30)).toEqual({ unit: 'months', count: 1 })
  })

  it('keeps the exact days otherwise', () => {
    expect(retentionPeriod(45)).toEqual({ unit: 'days', count: 45 })
    expect(retentionPeriod(400)).toEqual({ unit: 'days', count: 400 })
  })
})

describe('retentionCopy', () => {
  const tr = (key: string, params: Record<string, unknown> = {}) => `${key}:${JSON.stringify(params)}`

  it('renders each scope with its period, through the translator', () => {
    expect(retentionCopy({ selection: 365, talent_pool: 730 }, tr)).toEqual({
      selection: 'apply.period.years:{"count":1}',
      talentPool: 'apply.period.years:{"count":2}',
    })
    expect(retentionCopy({ selection: 90, talent_pool: 45 }, tr).talentPool).toBe('apply.period.days:{"count":45}')
  })
})

describe('noticeParagraphs', () => {
  it('splits plain text on blank lines and keeps single line breaks inside a paragraph', () => {
    expect(noticeParagraphs('Uno\nriga due\n\n\nDue\r\n\r\n  ')).toEqual(['Uno\nriga due', 'Due'])
    expect(noticeParagraphs('')).toEqual([])
  })
})
