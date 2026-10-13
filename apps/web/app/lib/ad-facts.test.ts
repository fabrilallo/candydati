import { describe, expect, it } from 'vitest'
import type { Params } from './ad-text'
import { approxMinutes, currencySymbol, processSummaryText, responseText, salaryFigure, salaryLabelKey, totalMinutes } from './ad-facts'

/** Fake translator: echoes the key and its params, resolving plurals like vue-i18n would not need to here. */
const tr = (key: string, params: Params = {}): string => {
  if (key === 'public.duration.minutes') return `${params.n} min`
  if (key === 'public.duration.hours') return `${params.n} h`
  if (key === 'public.duration.hoursMinutes') return `${params.h} h ${params.m} min`
  if (key === 'public.duration.days') return `${params.n} g`
  if (key === 'public.facts.stages') return params.count === 1 ? '1 fase' : `${params.count} fasi`
  if (key === 'public.facts.about') return `circa ${params.duration}`
  if (key === 'public.facts.within') return params.count === 1 ? 'entro 1 giorno' : `entro ${params.count} giorni`
  return key
}

const salary = (min?: number, max?: number, currency: 'EUR' | 'GBP' | 'USD' | 'CHF' = 'EUR') => ({ min, max, currency, period: 'year' as const })
const stage = (durationMinutes: number) => ({ type: 'screening_call' as const, durationMinutes, conductedBy: 'recruiter' as const })

describe('salaryFigure', () => {
  it('writes the range once with the currency where the language puts it, hyphen only', () => {
    expect(salaryFigure(salary(45000, 60000), 'it')).toBe('45.000 - 60.000 €')
    expect(salaryFigure(salary(45000, 60000, 'GBP'), 'en')).toBe('£45,000 - 60,000')
  })

  it('shows a single bound, or equal bounds, as one amount', () => {
    expect(salaryFigure(salary(45000), 'it')).toBe('45.000 €')
    expect(salaryFigure(salary(undefined, 60000), 'it')).toBe('60.000 €')
    expect(salaryFigure(salary(50000, 50000), 'en')).toBe('€50,000')
  })

  it('is null when no amount is set', () => {
    expect(salaryFigure(salary(), 'it')).toBeNull()
  })
})

describe('currencySymbol', () => {
  it('gives the symbol the language uses', () => {
    expect(currencySymbol('EUR', 'it')).toBe('€')
    expect(currencySymbol('GBP', 'en')).toBe('£')
  })
})

describe('salaryLabelKey', () => {
  it('calls a yearly amount RAL, otherwise names the gross period', () => {
    expect(salaryLabelKey('year')).toBe('public.facts.ral')
    expect(salaryLabelKey('month')).toBe('taxonomy.salaryPeriodsGross.month')
  })
})

describe('process summary', () => {
  it('adds up the stages', () => {
    expect(totalMinutes([stage(30), stage(90), stage(60)])).toBe(180)
    expect(totalMinutes([])).toBe(0)
  })

  it.each([
    [0, 0],
    [42, 40],
    [43, 45],
    [110, 105],
    [113, 120],
    [185, 180],
    [1500, 1440],
    [3000, 2880],
  ])('rounds %i minutes to a friendly %i', (minutes, expected) => {
    expect(approxMinutes(minutes)).toBe(expected)
  })

  it('reads "3 fasi, circa 3 h"', () => {
    expect(processSummaryText([stage(30), stage(90), stage(60)], tr)).toBe('3 fasi, circa 3 h')
    expect(processSummaryText([stage(45)], tr)).toBe('1 fase, circa 45 min')
    expect(processSummaryText([stage(30), stage(45)], tr)).toBe('2 fasi, circa 1 h 15 min')
  })

  it('is empty without stages', () => {
    expect(processSummaryText([], tr)).toBe('')
  })
})

describe('responseText', () => {
  it('states the commitment in days', () => {
    expect(responseText(5, tr)).toBe('entro 5 giorni')
    expect(responseText(1, tr)).toBe('entro 1 giorno')
    expect(responseText(undefined, tr)).toBe('')
  })
})
