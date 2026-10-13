import { type ReportsView, rate as rateOf, REPORT_MIN_SAMPLE, type FunnelStageDto, type FunnelStageType, type Rate, type ReportsDto    } from '@tt/domain';

/** Pure view models of the reports page. Every rate travels with its denominator; nothing here invents a figure. */

type Source = ReportsDto['sources'][number]

export const NO_VALUE = '—'
const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

/** Whole percentage, or null under `REPORT_MIN_SAMPLE` cases: too few to mean anything. */
export const percentOf = (rate: Rate): number | null => (rate.total < REPORT_MIN_SAMPLE || rate.rate === null ? null : Math.round(rate.rate * 100))

export const formatRate = (rate: Rate, locale: string): string => {
  const percent = percentOf(rate)
  return percent === null ? NO_VALUE : new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 0 }).format(percent / 100)
}

export const formatDaysValue = (value: number | null, locale: string): string =>
  value === null ? NO_VALUE : new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value)

export type ResponseTime = { readonly unit: 'hours' | 'days'; readonly value: number }

/** Hours under two days ("30 h"), days above ("2,5 giorni"). */
export const responseTime = (hours: number | null): ResponseTime | null => {
  if (hours === null) return null
  return hours < 48 ? { unit: 'hours', value: Math.round(hours) } : { unit: 'days', value: Math.round((hours / 24) * 10) / 10 }
}

const pct = (value: number, max: number): number => (max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100)))

export interface Headlines {
  /** Applications that entered `received` in the period; null when the funnel section is invalid. */
  readonly received: number | null
  readonly timeToHire: ReportsDto['timeToHire']['overall'] | null
  readonly responses: Rate | null
  readonly coverage: Rate | null
}

export const headlines = (report: ReportsView): Headlines => ({
  received: report.funnel === null ? null : (report.funnel.stages.find((stage) => stage.type === 'received')?.entered ?? 0),
  timeToHire: report.timeToHire?.overall ?? null,
  responses: report.responses?.closed ?? null,
  coverage: report.outcomeCoverage,
})

export interface FunnelRow extends FunnelStageDto {
  /** Bar width in percent of the widest stage. */
  readonly width: number
}

/** Rows in the order the api gives them (job order with a job filter, canonical stage type order without). */
export const funnelRows = (stages: readonly FunnelStageDto[]): readonly FunnelRow[] => {
  const max = Math.max(0, ...stages.map((stage) => stage.entered))
  return stages.map((stage) => ({ ...stage, width: pct(stage.entered, max) }))
}

export interface SourceRow extends Source {
  readonly width: number
  readonly hireRate: Rate
}

export const sourceRows = (sources: readonly Source[]): readonly SourceRow[] => {
  const max = Math.max(0, ...sources.map((source) => source.applications))
  return sources
    .toSorted((a, b) => b.applications - a.applications || a.origin.localeCompare(b.origin))
    .map((source) => ({ ...source, width: pct(source.applications, max), hireRate: rateOf(source.hires, source.applications) }))
}

export interface StageTypeRow {
  readonly type: FunnelStageType
  readonly kept: number
  readonly missed: number
  readonly total: number
  readonly keptRate: Rate
  /** Widths of the two parts of a bar as long as the whole row: kept, then missed. */
  readonly keptWidth: number
  readonly missedWidth: number
}

export const stageTypeRows = (rows: ReportsDto['responses']['byStageType']): readonly StageTypeRow[] =>
  rows
    .map((row) => {
      const total = row.kept + row.missed
      const keptWidth = pct(row.kept, total)
      return { type: row.type, kept: row.kept, missed: row.missed, total, keptRate: row.keptRate, keptWidth, missedWidth: total === 0 ? 0 : 100 - keptWidth }
    })
    .toSorted((a, b) => b.total - a.total)

export interface TimeRow {
  readonly jobId: string
  readonly title: string
  readonly hires: number
  readonly medianDays: number | null
  readonly p75Days: number | null
  readonly fillDays: number | null
  /** Positions on the shared scale, in percent; null when the figure is missing. */
  readonly medianAt: number | null
  readonly p75At: number | null
  readonly fillAt: number | null
}

export interface TimeView {
  readonly max: number
  readonly rows: readonly TimeRow[]
}

const at = (value: number | null, max: number): number | null => (value === null ? null : pct(value, max))

/** Time to hire and time to fill side by side per job, in the order the api lists them. */
export const timeRows = (report: Pick<ReportsView, 'timeToHire' | 'timeToFill'>): TimeView => {
  const hires = report.timeToHire?.byJob ?? []
  const fills = new Map((report.timeToFill?.items ?? []).map((item) => [item.jobId, item]))
  const ids = [...new Set([...hires.map((job) => job.jobId), ...fills.keys()])]
  const base = ids.map((jobId) => {
    const hire = hires.find((job) => job.jobId === jobId)
    const fill = fills.get(jobId)
    return { jobId, title: hire?.title ?? fill?.title ?? '', hires: hire?.count ?? 0, medianDays: hire?.median ?? null, p75Days: hire?.p75 ?? null, fillDays: fill?.days ?? null }
  })
  const max = Math.max(0, ...base.flatMap((row) => [row.medianDays ?? 0, row.p75Days ?? 0, row.fillDays ?? 0]))
  return { max, rows: base.map((row) => ({ ...row, medianAt: at(row.medianDays, max), p75At: at(row.p75Days, max), fillAt: at(row.fillDays, max) })) }
}

/** Nothing entered, was decided or answered in the period: the page shows one empty state instead of five. An invalid section is not "empty". */
export const isReportEmpty = (report: ReportsView): boolean =>
  (report.funnel?.stages.every((stage) => stage.entered === 0) ?? false) &&
  report.sources?.length === 0 &&
  report.timeToHire?.overall.count === 0 &&
  report.timeToFill?.items.length === 0 &&
  report.responses !== null &&
  report.responses.kept + report.responses.missed + report.responses.open === 0
