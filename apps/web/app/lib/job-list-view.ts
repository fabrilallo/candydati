import { CUSTOM_ROLE, type JobSummaryDto } from '@candydati/domain'

export type Readiness = { readonly kind: 'ready' } | { readonly kind: 'missing'; readonly count: number }

/** What a draft still needs before it can go live. Published and closed ads have no readiness. */
export const readinessOf = (job: JobSummaryDto): Readiness | null => {
  if (job.status !== 'draft') return null
  return job.publishable ? { kind: 'ready' } : { kind: 'missing', count: job.publishIssueCount }
}

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
]

/** "5 giorni fa", "ieri", "adesso". Never in the future; empty string for an unreadable date. */
export const relativeTime = (iso: string, now: Date, locale: string): string => {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const elapsed = Math.max(0, now.getTime() - then)
  const unit = UNITS.find(([, size]) => elapsed >= size)
  if (!unit) return formatter.format(0, 'second')
  return formatter.format(-Math.floor(elapsed / unit[1]), unit[0])
}

/** Message keys for the quiet facts of a list item; null when the draft has not set them yet. */
export const jobFacts = (job: JobSummaryDto): { readonly roleKey: string | null; readonly roleText: string | null; readonly workModeKey: string | null } => ({
  roleKey: job.role && job.role !== CUSTOM_ROLE ? `taxonomy.roles.${job.role}` : null,
  /** Text of a custom role; null for a taxonomy role or a custom role still without text. */
  roleText: job.role === CUSTOM_ROLE ? job.customRole?.trim() || null : null,
  workModeKey: job.workMode ? `taxonomy.workModes.${job.workMode}` : null,
})
