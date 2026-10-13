import { OUTCOMES, REPORT_MIN_SAMPLE, STAGE_TYPES, type FunnelStageType, type ReportsDto } from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY Phase 10 pieces the domain does not export yet: the HTTP paths of the reports and a Zod schema for
 * `ReportsDto` (the type itself comes from `@tt/domain`). Counts are required: a missing figure is an error, never a
 * zero. Whatever `@tt/domain` exports later replaces the matching piece here.
 */

export const REPORTS_PATH = '/api/v1/reports'
export const REPORTS_CSV_PATH = '/api/v1/reports/export.csv'

const count = z.number().int().nonnegative()
const share = z.number().min(0).max(1).nullable()
const duration = z.number().nonnegative().nullable()
const rate = z.object({ count, total: count, rate: share })
const durationStat = z.object({ count, median: duration, p75: duration })
const FUNNEL_TYPES = ['received', ...STAGE_TYPES] as const
const funnelType = z.enum(FUNNEL_TYPES) as z.ZodType<FunnelStageType>
const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, count])) as Record<(typeof OUTCOMES)[number], typeof count>
const jobRef = { jobId: z.string(), title: z.string() }

const sectionSchemas = {
  timeToHire: z.object({ overall: durationStat, byJob: z.array(z.object({ ...jobRef, ...durationStat.shape })) }),
  timeToFill: z.object({
    overall: durationStat,
    items: z.array(z.object({ ...jobRef, publishedAt: z.string(), firstHireAt: z.string(), days: z.number().nonnegative() })),
  }),
  funnel: z.object({
    stages: z.array(z.object({ position: z.number().int().nonnegative().nullable(), stageId: z.string().nullable(), title: z.string().nullable(), type: funnelType, entered: count, conversionToNext: rate.nullable() })),
    outcomes: z.object(outcomeCounts),
    outcomesByJob: z.array(z.object({ ...jobRef, ...outcomeCounts })),
  }),
  sources: z.array(z.object({ origin: z.string(), applications: count, hires: count })),
  responses: z.object({
    closed: rate,
    kept: count,
    missed: count,
    responseHours: durationStat,
    open: count,
    overdue: count,
    byJob: z.array(z.object({ ...jobRef, kept: count, missed: count, keptRate: rate })),
    byStageType: z.array(z.object({ type: funnelType, kept: count, missed: count, keptRate: rate })),
  }),
  outcomeCoverage: rate,
}


export type ReportKey = keyof typeof sectionSchemas
export const REPORT_KEYS = Object.keys(sectionSchemas) as readonly ReportKey[]

/** The reports with every section validated on its own: a section that fails is `null`, the others stay. */
export type ReportsView = { readonly minSample: number } & { readonly [K in ReportKey]: ReportsDto[K] | null }

const envelope = z.looseObject({ minSample: z.unknown().optional() })

/**
 * Validates each section separately. One malformed section must never blank the page: it becomes `null` (the card shows a
 * short error) and the failure is logged. Rates stay capped at 1 inside the sections. Only a non-object answer throws.
 */
export const reportsSchema: z.ZodType<ReportsView> = envelope.transform((raw): ReportsView => {
  const minSample = count.safeParse(raw.minSample)
  const entries = REPORT_KEYS.map((key) => {
    const parsed = sectionSchemas[key].safeParse(raw[key])
    if (!parsed.success) console.error('[reports] invalid section', key, parsed.error.issues[0]?.path.join('.'), parsed.error.issues[0]?.message)
    return [key, parsed.success ? parsed.data : null] as const
  })
  return { minSample: minSample.success ? minSample.data : REPORT_MIN_SAMPLE, ...Object.fromEntries(entries) } as ReportsView
}) as unknown as z.ZodType<ReportsView>
