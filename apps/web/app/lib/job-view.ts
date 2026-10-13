import type { JobContent, JobStatus, PublishedJobContent } from '@tt/domain'
import type { Translate } from './ad-text'
import { countryName } from './countries'

const intlLocale = (language: string): string => (language === 'it' ? 'it-IT' : 'en-GB')

export const formatMoney = (amount: number, currency: string, language: string): string =>
  new Intl.NumberFormat(intlLocale(language), { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

/** `45.000 € - 60.000 €`; a single bound is shown alone. Always whole units, always the currency. */
export const salaryRange = (salary: JobContent['salary'], language: string): string => {
  const { min, max, currency } = salary
  if (min !== undefined && max !== undefined) return min === max ? formatMoney(min, currency, language) : `${formatMoney(min, currency, language)} - ${formatMoney(max, currency, language)}`
  const only = min ?? max
  return only === undefined ? '' : formatMoney(only, currency, language)
}

/** `45.000 € - 60.000 €, lordi all'anno (RAL)`. */
export const salaryLine = (salary: JobContent['salary'], language: string, tr: Translate): string => {
  const range = salaryRange(salary, language)
  return range === '' ? '' : `${range}, ${tr(`taxonomy.salaryPeriodsGross.${salary.period}`)}`
}

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export const formatDuration = (minutes: number, tr: Translate): string => {
  if (minutes < MINUTES_PER_HOUR) return tr('public.duration.minutes', { n: minutes })
  if (minutes < MINUTES_PER_DAY) {
    const hours = Math.floor(minutes / MINUTES_PER_HOUR)
    const rest = minutes % MINUTES_PER_HOUR
    return rest === 0 ? tr('public.duration.hours', { n: hours }) : tr('public.duration.hoursMinutes', { h: hours, m: rest })
  }
  return tr('public.duration.days', { n: Math.round(minutes / MINUTES_PER_DAY) })
}

interface Place {
  readonly workMode: PublishedJobContent['workMode'] | undefined
  readonly location: JobContent['location']
}

/** `Milano, Italia` or, for remote work, the country alone. */
export const placeLine = ({ workMode, location }: Place, language: string): string => {
  const country = location.country ? countryName(location.country, language) : ''
  const city = workMode === 'remote' ? '' : (location.city ?? '')
  return [city, country].filter((part) => part !== '').join(', ')
}

export const publicJobPath = (orgSlug: string, jobSlug: string): string => `/careers/${encodeURIComponent(orgSlug)}/${encodeURIComponent(jobSlug)}`
export const careersPath = (orgSlug: string): string => `/careers/${encodeURIComponent(orgSlug)}`
export const absoluteUrl = (siteUrl: string, path: string): string => `${siteUrl.replace(/\/+$/, '')}${path}`

export type BadgeTone = 'success' | 'secondary' | 'outline'
/** Status pills (docs/DESIGN-SYSTEM.md): published = success (live), draft = neutral, closed = outline (muted). */
export const statusTone = (status: JobStatus): BadgeTone => (status === 'published' ? 'success' : status === 'draft' ? 'secondary' : 'outline')
