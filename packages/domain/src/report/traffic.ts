import { z } from 'zod';
import { DAY_MS } from '../response/response-state.js';

/**
 * Visits and applications of one job, day by day, per source and campaign: what the chart of the Distribution tab draws.
 * Counts only: visits come from the daily counters (`job_view_daily`, nothing per visitor), applications from their
 * origin. Days are UTC, like the visit counters.
 */

/** The longest period the chart asks for. */
export const TRAFFIC_MAX_DAYS = 366;

export const jobTrafficQuerySchema = z
  .object({
    jobId: z.string().min(1).max(200),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.from <= q.to, { message: 'from_after_to', path: ['from'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= TRAFFIC_MAX_DAYS * DAY_MS, { message: 'period_too_long', path: ['to'] });
export type JobTrafficQuery = z.input<typeof jobTrafficQuerySchema>;

const count = z.number().int().nonnegative();

/** One day, one source, one campaign (`''`: none). Days with nothing are absent. */
export const trafficRowSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origin: z.string(),
  campaign: z.string(),
  visits: count,
  applications: count,
});
export type TrafficRow = z.infer<typeof trafficRowSchema>;

/** Exactly what `GET /jobs/:id/traffic` returns. */
export const jobTrafficSchema = z.object({
  jobId: z.string(),
  from: z.string(),
  to: z.string(),
  rows: z.array(trafficRowSchema),
});
export type JobTrafficDto = z.infer<typeof jobTrafficSchema>;
