import { REPORT_MIN_SAMPLE, type TrafficRow } from '@candydati/domain'

/**
 * Pure view models of the Distribution chart: visits and applications per day of one ad, for every source or one of them.
 * Days are UTC, like the visit counters. Nothing here invents a figure: a rate needs at least `REPORT_MIN_SAMPLE` visits.
 */

export const TRAFFIC_DAYS = [7, 30, 90] as const
export type TrafficDays = (typeof TRAFFIC_DAYS)[number]
export const DEFAULT_TRAFFIC_DAYS: TrafficDays = 30

const DAY_MS = 86_400_000

export interface TrafficPeriod {
  /** `YYYY-MM-DD` (UTC), both inclusive. */
  readonly from: string
  readonly to: string
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10)

export const trafficPeriod = (days: number, now: Date): TrafficPeriod => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return { from: utcDay(new Date(today - (days - 1) * DAY_MS)), to: utcDay(new Date(today)) }
}

/** Query string of `GET /api/v1/jobs/:id/traffic`: whole UTC days. */
export const trafficQuery = (period: TrafficPeriod): string =>
  new URLSearchParams({ from: `${period.from}T00:00:00.000Z`, to: `${period.to}T23:59:59.999Z` }).toString()

/**
 * Which source the chart shows: null for all; `campaign` null for a source with every campaign, a string (`''`: none)
 * for one exact link. Sanitized labels never contain `|`, so the select value is `origin` or `origin|campaign`.
 */
export interface SourceFilter {
  readonly origin: string
  readonly campaign: string | null
}

export const sourceFilterOf = (filter: SourceFilter | null): string => {
  if (filter === null) return ''
  return filter.campaign === null ? filter.origin : `${filter.origin}|${filter.campaign}`
}

export const parseSourceFilter = (value: string): SourceFilter | null => {
  if (value === '') return null
  const bar = value.indexOf('|')
  return bar < 0 ? { origin: value, campaign: null } : { origin: value.slice(0, bar), campaign: value.slice(bar + 1) }
}

/** A traffic row or an application (whose campaign is null when none) under the filter. */
export const matchesSource = (item: { readonly origin: string; readonly campaign: string | null }, filter: SourceFilter | null): boolean =>
  filter === null || (item.origin === filter.origin && (filter.campaign === null || (item.campaign ?? '') === filter.campaign))

export interface DayPoint {
  readonly index: number
  readonly day: string
  readonly label: string
  readonly visits: number
  readonly applications: number
}

const dayLabel = (day: string, locale: string): string =>
  new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

/** Every day of the period, zeros included, with the visits and applications of the filtered source. */
export function dailySeries(rows: readonly TrafficRow[], filter: SourceFilter | null, period: TrafficPeriod, locale: string): readonly DayPoint[] {
  const start = Date.parse(`${period.from}T00:00:00Z`)
  const count = Math.max(0, Math.round((Date.parse(`${period.to}T00:00:00Z`) - start) / DAY_MS) + 1)
  const kept = rows.filter((row) => matchesSource(row, filter))
  return Array.from({ length: count }, (_, index) => {
    const day = utcDay(new Date(start + index * DAY_MS))
    const ofDay = kept.filter((row) => row.day === day)
    return {
      index,
      day,
      label: dayLabel(day, locale),
      visits: ofDay.reduce((sum, row) => sum + row.visits, 0),
      applications: ofDay.reduce((sum, row) => sum + row.applications, 0),
    }
  })
}

/**
 * Applications per 100 visits. `no_visits`: nothing counted; `few_visits`: under `REPORT_MIN_SAMPLE` visits, too few to
 * mean anything. It can pass 100: an applicant whose browser sent no visit (no JavaScript, a blocker) still counts.
 */
export interface Conversion {
  readonly state: 'no_visits' | 'few_visits' | 'ok'
  readonly per100: number | null
}

export const conversionOf = (applications: number, visits: number): Conversion => {
  if (visits === 0) return { state: 'no_visits', per100: null }
  if (visits < REPORT_MIN_SAMPLE) return { state: 'few_visits', per100: null }
  return { state: 'ok', per100: Math.round((applications / visits) * 100) }
}

export interface TrafficTotals {
  readonly visits: number
  readonly applications: number
  readonly conversion: Conversion
}

export const trafficTotals = (points: readonly DayPoint[]): TrafficTotals => {
  const visits = points.reduce((sum, point) => sum + point.visits, 0)
  const applications = points.reduce((sum, point) => sum + point.applications, 0)
  return { visits, applications, conversion: conversionOf(applications, visits) }
}

interface Figures {
  readonly visits: number
  readonly applications: number
  readonly conversion: Conversion
}

export interface SourceSummary extends Figures {
  readonly origin: string
  /** Only the campaigns that are not empty. */
  readonly campaigns: readonly (Figures & { readonly campaign: string })[]
}

const sum = (rows: readonly TrafficRow[]): Figures => {
  const visits = rows.reduce((total, row) => total + row.visits, 0)
  const applications = rows.reduce((total, row) => total + row.applications, 0)
  return { visits, applications, conversion: conversionOf(applications, visits) }
}

const byMost = (a: Figures, b: Figures): number => b.applications - a.applications || b.visits - a.visits

/** One summary per source of the period, most applications (then visits) first; campaigns the same way. */
export function sourceSummaries(rows: readonly TrafficRow[]): readonly SourceSummary[] {
  const origins = [...new Set(rows.map((row) => row.origin))]
  return origins
    .map((origin) => {
      const ofOrigin = rows.filter((row) => row.origin === origin)
      const campaigns = [...new Set(ofOrigin.map((row) => row.campaign).filter((campaign) => campaign !== ''))]
        .map((campaign) => ({ campaign, ...sum(ofOrigin.filter((row) => row.campaign === campaign)) }))
        .toSorted((a, b) => byMost(a, b) || a.campaign.localeCompare(b.campaign))
      return { origin, ...sum(ofOrigin), campaigns }
    })
    .toSorted((a, b) => byMost(a, b) || a.origin.localeCompare(b.origin))
}

/** One choice of the source select: a saved link (exact channel and campaign), a source, or one campaign of a source. */
export interface FilterChoice {
  readonly value: string
  readonly origin: string
  readonly campaign: string | null
  readonly kind: 'link' | 'source' | 'campaign'
}

/** Saved links first (also without figures yet), then every source of the period with its campaigns; each value once. */
export function filterChoices(summaries: readonly SourceSummary[], links: readonly { readonly source: string; readonly campaign: string }[]): readonly FilterChoice[] {
  const ofLinks = links.map((link): FilterChoice => ({ value: sourceFilterOf({ origin: link.source, campaign: link.campaign }), origin: link.source, campaign: link.campaign, kind: 'link' }))
  const ofSources = summaries.flatMap((summary): FilterChoice[] => [
    { value: sourceFilterOf({ origin: summary.origin, campaign: null }), origin: summary.origin, campaign: null, kind: 'source' },
    ...summary.campaigns.map((row): FilterChoice => ({ value: sourceFilterOf({ origin: summary.origin, campaign: row.campaign }), origin: summary.origin, campaign: row.campaign, kind: 'campaign' })),
  ])
  const seen = new Set(ofLinks.map((choice) => choice.value))
  return [...ofLinks, ...ofSources.filter((choice) => !seen.has(choice.value))]
}
