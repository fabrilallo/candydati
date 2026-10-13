import type { JobContent, SelectionStage } from '@tt/domain'
import type { Translate } from './ad-text'
import { formatDuration } from './job-view'

const intlLocale = (language: string): string => (language === 'it' ? 'it-IT' : 'en-GB')

const currencyFirst = (currency: string, language: string): boolean => {
  const parts = new Intl.NumberFormat(intlLocale(language), { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(1)
  return parts.findIndex((part) => part.type === 'currency') < parts.findIndex((part) => part.type === 'integer')
}

export const currencySymbol = (currency: string, language: string): string =>
  new Intl.NumberFormat(intlLocale(language), { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(1).find((part) => part.type === 'currency')?.value ?? currency

/** Whole units with the language's grouping, e.g. `45.000` or `45,000`. Grouping is forced from 1.000 up. */
export const groupAmount = (amount: number, language: string): string =>
  new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: 0, useGrouping: 'always' }).format(amount)

/**
 * The headline figure of an ad: `45.000 - 60.000 €` (it) or `£45,000 - 60,000` (en). The currency appears once,
 * where the language puts it; the separator is a plain hyphen (no en dash, see docs/DESIGN.md).
 */
export const salaryFigure = (salary: JobContent['salary'], language: string): string | null => {
  const { min, max, currency } = salary
  const amounts = [...new Set([min, max].filter((value): value is number => value !== undefined))]
  if (amounts.length === 0) return null
  const range = amounts.map((amount) => groupAmount(amount, language)).join(' - ')
  const symbol = currencySymbol(currency, language)
  return currencyFirst(currency, language) ? `${symbol}${range}` : `${range} ${symbol}`
}

/** Label above the figure: `RAL lorda` for a yearly amount, the gross period otherwise. */
export const salaryLabelKey = (period: JobContent['salary']['period']): string =>
  period === 'year' ? 'public.facts.ral' : `taxonomy.salaryPeriodsGross.${period}`

export const totalMinutes = (process: readonly Pick<SelectionStage, 'durationMinutes'>[]): number =>
  process.reduce((sum, stage) => sum + stage.durationMinutes, 0)

const HOUR = 60
const DAY = 24 * HOUR
const roundTo = (value: number, step: number): number => Math.round(value / step) * step

/** A time a candidate can plan around: 5 minutes under an hour, quarters of an hour under a day, then days. */
export const approxMinutes = (minutes: number): number => {
  if (minutes < HOUR) return roundTo(minutes, 5)
  if (minutes < DAY) return roundTo(minutes, 15)
  return roundTo(minutes, DAY)
}

/** `3 fasi, circa 3 h`, in the language of `tr`. Empty without stages. */
export const processSummaryText = (process: readonly Pick<SelectionStage, 'durationMinutes'>[], tr: Translate): string => {
  if (process.length === 0) return ''
  const about = tr('public.facts.about', { duration: formatDuration(approxMinutes(totalMinutes(process)), tr) })
  return `${tr('public.facts.stages', { count: process.length })}, ${about}`
}

/** `entro 5 giorni`. Empty when the commitment is not set. */
export const responseText = (days: number | undefined, tr: Translate): string => (days === undefined ? '' : tr('public.facts.within', { count: days }))
