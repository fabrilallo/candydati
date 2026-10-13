import { OUTCOMES } from '@tt/domain';
import { z } from 'zod';

const duration = z.object({ count: z.number().int(), median: z.number().nullable(), p75: z.number().nullable() });
const rate = z.object({ count: z.number().int(), total: z.number().int(), rate: z.number().nullable() });
const jobRef = { jobId: z.string(), title: z.string() };
const outcomes = z.object(Object.fromEntries(OUTCOMES.map((outcome) => [outcome, z.number().int()])) as Record<(typeof OUTCOMES)[number], z.ZodNumber>);

/** Aggregates only: no names, no candidate data. A rate always carries its denominator; show "-" under `minSample`. */
export const reportsSchema = z.object({
  generatedAt: z.iso.datetime(),
  period: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
  jobId: z.string().nullable(),
  minSample: z.number().int(),
  timeToHire: z.object({ overall: duration, byJob: z.array(duration.extend(jobRef)) }),
  timeToFill: z.object({
    overall: duration,
    items: z.array(z.object({ ...jobRef, publishedAt: z.iso.datetime(), firstHireAt: z.iso.datetime(), days: z.number() })),
  }),
  funnel: z.object({
    stages: z.array(z.object({ position: z.number().int().nullable(), stageId: z.string().nullable(), title: z.string().nullable(), type: z.string(), entered: z.number().int(), conversionToNext: rate.nullable() })),
    outcomes,
    outcomesByJob: z.array(outcomes.extend(jobRef)),
  }),
  sources: z.array(z.object({ origin: z.string(), applications: z.number().int(), hires: z.number().int() })),
  responses: z.object({
    closed: rate,
    kept: z.number().int(),
    missed: z.number().int(),
    responseHours: duration,
    open: z.number().int(),
    overdue: z.number().int(),
    byJob: z.array(z.object({ ...jobRef, kept: z.number().int(), missed: z.number().int(), keptRate: rate })),
    byStageType: z.array(z.object({ type: z.string(), kept: z.number().int(), missed: z.number().int(), keptRate: rate })),
  }),
  outcomeCoverage: rate,
});
