/**
 * The period of the reports: the last 30, 90 or 365 days, or a custom range of calendar days. Kept in the page's
 * state, not in the URL. Days are inclusive; the api receives them as UTC instants (start and end of day).
 */
export const PERIOD_PRESETS = ['last30', 'last90', 'last365', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]
export type FixedPreset = Exclude<PeriodPreset, 'custom'>

export interface Period {
  /** `YYYY-MM-DD`, inclusive. */
  readonly from: string
  readonly to: string
}

const PRESET_DAYS: Readonly<Record<FixedPreset, number>> = { last30: 30, last90: 90, last365: 365 }
const pad = (value: number): string => String(value).padStart(2, '0')

export const isoDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const presetPeriod = (preset: FixedPreset, today: Date): Period => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PRESET_DAYS[preset] - 1))
  return { from: isoDay(start), to: isoDay(today) }
}

/** A real calendar day (`2026-02-30` is not). */
const isDay = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return isoDay(new Date(year, month - 1, day)) === value
}

export type CustomCheck = { readonly ok: true; readonly period: Period } | { readonly ok: false; readonly key: string }

export const checkCustomPeriod = (from: string, to: string, today: Date): CustomCheck => {
  if (!isDay(from) || !isDay(to)) return { ok: false, key: 'reports.period.errors.missing' }
  if (from > to) return { ok: false, key: 'reports.period.errors.order' }
  if (to > isoDay(today)) return { ok: false, key: 'reports.period.errors.future' }
  return { ok: true, period: { from, to } }
}

/** Query string of `GET /api/v1/reports` and of the CSV export. */
export const reportsQuery = (period: Period, jobId: string | null): string => {
  const params = new URLSearchParams({ from: `${period.from}T00:00:00.000Z`, to: `${period.to}T23:59:59.999Z` })
  if (jobId) params.set('jobId', jobId)
  return params.toString()
}
