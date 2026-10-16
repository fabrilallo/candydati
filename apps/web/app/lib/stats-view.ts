import type { JobStatsDto, JobStatus } from '@candydati/domain'

/** Pure view helpers for the overview charts. Inputs come from `JobStatsDto`; nothing here invents a figure. */

type Stats = JobStatsDto
export type Week = Stats['weekly'][number]
export type QualityItem = Stats['quality']['items'][number]
export type SalaryItem = Stats['salary']['items'][number]
export type SalaryGroup = Stats['salary']['medians'][number]
export type Blocker = Stats['readiness']['blockers'][number]

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

/** `2026-10-05` -> `5 ott`. Read in UTC, as the server buckets weeks in UTC. */
export const weekLabel = (weekStart: string, locale: string): string =>
  new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${weekStart}T00:00:00Z`)).replace('.', '')

export interface WeekPoint {
  readonly index: number
  readonly label: string
  readonly created: number
  readonly published: number
}

export const weeklySeries = (weekly: readonly Week[], locale: string): readonly WeekPoint[] =>
  weekly.map((week, index) => ({ index, label: weekLabel(week.weekStart, locale), created: week.created, published: week.published }))

export const hasActivity = (weekly: readonly Week[]): boolean => weekly.some((week) => week.created > 0 || week.published > 0)

/** Published first: it is the figure that matters to candidates. */
const SLICE_ORDER: readonly JobStatus[] = ['published', 'draft', 'closed']

export const statusSlices = (counts: Stats['statusCounts']): readonly { readonly status: JobStatus; readonly value: number }[] =>
  SLICE_ORDER.map((status) => ({ status, value: counts[status] }))

export interface SalaryRow extends SalaryItem {
  readonly index: number
  /** Width of the range, drawn on top of an invisible `min` offset. */
  readonly span: number
}

export interface SalaryView {
  /** The currency and period with most ads: amounts are only comparable inside it. */
  readonly group: SalaryGroup | null
  readonly items: readonly SalaryRow[]
  /** Published ads in other currencies or periods, left out of the chart. */
  readonly otherCount: number
}

export const salaryView = (salary: Stats['salary']): SalaryView => {
  const group = salary.medians[0] ?? null
  if (!group) return { group: null, items: [], otherCount: 0 }
  const items = salary.items
    .filter((item) => item.currency === group.currency && item.period === group.period)
    .map((item, index) => ({ ...item, index, span: item.max - item.min }))
  return { group, items, otherCount: salary.items.length - items.length }
}

export const qualityRows = (items: readonly QualityItem[]): readonly (QualityItem & { readonly index: number })[] =>
  items.map((item, index) => ({ ...item, index }))

export interface BlockerLabel {
  readonly key: string
  /** For a missing value, the field name to put in the message. */
  readonly fieldKey: string | null
}

export const blockerLabel = (blocker: Blocker): BlockerLabel =>
  blocker.rule === 'required'
    ? { key: 'dashboard.stats.readiness.missing', fieldKey: `job.fields.${blocker.path}` }
    : { key: `dashboard.stats.readiness.rules.${blocker.rule}`, fieldKey: null }

export const formatDecimal = (value: number, locale: string): string =>
  new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value)

/** `42.500 €` -> `42,5 k€` style, for axes and dense labels. */
export const compactMoney = (amount: number, currency: string, locale: string): string =>
  new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount)

/** Title shortened for a chart axis; the full title stays in the table and the tooltip. */
export const shortTitle = (title: string, max = 22): string => (title.length <= max ? title : `${title.slice(0, max - 1).trimEnd()}…`)

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Chart tooltips are HTML strings: anything written by users (ad titles) is escaped first. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

/** Integer ticks only: counts never show `0,5`. */
export const integerTick = (value: number | Date): string => (typeof value === 'number' && Number.isInteger(value) ? String(value) : '')

/** Chart colours, as CSS variables so both themes follow without re-rendering. */
export const CHART_COLORS = {
  main: 'var(--primary)',
  neutral: 'var(--chart-neutral)',
  below: 'var(--warning)',
  published: 'var(--success)',
  draft: 'var(--chart-neutral)',
  closed: 'var(--input)',
  none: 'transparent',
} as const
