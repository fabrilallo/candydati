import { z } from 'zod';
import { jobSummarySchema } from './job.js';
import { isoDate } from './common.js';

/** `GET /jobs/stale`: the api returns `{ job: JobSummaryDto, lastActivityAt, daysIdle }` for each ad quiet for 90 days. */
export const staleJobSchema = z.object({
  job: jobSummarySchema,
  lastActivityAt: isoDate,
  daysIdle: z.number().int().nonnegative(),
});
export type StaleJobDto = z.output<typeof staleJobSchema>;
