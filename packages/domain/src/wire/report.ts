import { z } from 'zod';
import { OUTCOMES } from '../candidate/application.js';
import { STAGE_TYPES } from '../job/taxonomy.js';
import { REPORT_MIN_SAMPLE } from '../report/stats.js';
import type { FunnelStageType, ReportsDto } from '../report/reports.js';

/**
 * Zod schema of `ReportsDto`, exactly what `GET /reports` returns. Counts are required: a missing figure is an error,
 * never a zero.
 */
const count = z.number().int().nonnegative();
const share = z.number().min(0).max(1).nullable();
const duration = z.number().nonnegative().nullable();
const rate = z.object({ count, total: count, rate: share });
const durationStat = z.object({ count, median: duration, p75: duration });
const FUNNEL_TYPES = ['received', ...STAGE_TYPES] as const;
const funnelType = z.enum(FUNNEL_TYPES) as z.ZodType<FunnelStageType>;
const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, count])) as Record<(typeof OUTCOMES)[number], typeof count>;
const jobRef = { jobId: z.string(), title: z.string() };

const sourceRow = z.object({ origin: z.string(), applications: count, hires: count, visits: count, conversion: z.number().nonnegative().nullable() });

const sectionSchemas = {
  timeToHire: z.object({ overall: durationStat, byJob: z.array(z.object({ ...jobRef, ...durationStat.shape })) }),
  timeToFill: z.object({
    overall: durationStat,
    items: z.array(z.object({ ...jobRef, publishedAt: z.string(), firstHireAt: z.string(), days: z.number().nonnegative() })),
  }),
  funnel: z.object({
    stages: z.array(
      z.object({
        position: z.number().int().nonnegative().nullable(),
        stageId: z.string().nullable(),
        title: z.string().nullable(),
        type: funnelType,
        entered: count,
        conversionToNext: rate.nullable(),
      }),
    ),
    outcomes: z.object(outcomeCounts),
    outcomesByJob: z.array(z.object({ ...jobRef, ...outcomeCounts })),
  }),
  sources: z.array(sourceRow),
  campaigns: z.array(z.object({ ...sourceRow.shape, campaign: z.string() })),
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
};

export type ReportKey = keyof typeof sectionSchemas;
export const REPORT_KEYS = Object.keys(sectionSchemas) as readonly ReportKey[];

/**
 * The reports with every section validated on its own: a section that fails is `null` and named in `invalid`, the others
 * stay. One malformed section never blanks the page.
 */
export type ReportsView = {
  readonly minSample: number;
  readonly invalid: readonly ReportKey[];
} & { readonly [K in ReportKey]: ReportsDto[K] | null };

const envelope = z.looseObject({ minSample: z.unknown().optional() });

export const reportsSchema = envelope.transform((raw): ReportsView => {
  const minSample = count.safeParse(raw.minSample);
  const parsed = REPORT_KEYS.map((key) => [key, sectionSchemas[key].safeParse(raw[key])] as const);
  const sections = Object.fromEntries(parsed.map(([key, result]) => [key, result.success ? result.data : null]));
  const invalid = parsed.filter(([, result]) => !result.success).map(([key]) => key);
  return { minSample: minSample.success ? minSample.data : REPORT_MIN_SAMPLE, invalid, ...sections } as unknown as ReportsView;
});
