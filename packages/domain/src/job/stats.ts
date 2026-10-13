import { z } from 'zod';
import { JOB_ROLES, SALARY_CURRENCIES, SALARY_PERIODS } from './taxonomy.js';
import { PUBLISH_RULES } from './content.js';

/** How many weeks of activity the overview shows, the current one included. */
export const STATS_WEEKS = 12;

const count = z.number().int().min(0);
/** A plain calendar day, `YYYY-MM-DD`: the Monday (UTC) that opens the week. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Aggregates of the organization's job ads, for the overview. Real numbers only: every figure is computed
 * from stored ads, nothing is estimated. Averages are null when there is nothing to average.
 * Candidate metrics (funnel, time to hire, response times kept) arrive with applications.
 */
export const jobStatsDtoSchema = z.object({
  generatedAt: z.iso.datetime(),
  statusCounts: z.object({ draft: count, published: count, closed: count, total: count }),
  /** Oldest first, exactly `STATS_WEEKS` entries, empty weeks included. */
  weekly: z.array(z.object({ weekStart: day, created: count, published: count })),
  quality: z.object({
    /** On the 0-10 scale, set per instance. */
    threshold: z.number(),
    /** Published ads with a stored score, lowest score first. */
    items: z.array(z.object({ id: z.string(), title: z.string(), total: z.number(), belowThreshold: z.boolean() })),
    average: z.number().nullable(),
    belowCount: count,
  }),
  salary: z.object({
    /** Published ads, grouped by role then by minimum. */
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        role: z.enum(JOB_ROLES),
        min: z.number(),
        max: z.number(),
        currency: z.enum(SALARY_CURRENCIES),
        period: z.enum(SALARY_PERIODS),
      }),
    ),
    /** One entry per currency and period, most ads first: medians are only comparable inside a group. */
    medians: z.array(
      z.object({
        currency: z.enum(SALARY_CURRENCIES),
        period: z.enum(SALARY_PERIODS),
        count,
        medianMin: z.number(),
        medianMax: z.number(),
      }),
    ),
  }),
  /** What published ads promise to candidates (PRODUCT.md §2, principle 2). */
  process: z.object({
    jobCount: count,
    averageStages: z.number().nullable(),
    /** Sum of the declared stage durations, averaged over ads. */
    averageProcessMinutes: z.number().nullable(),
    averageResponseDays: z.number().nullable(),
  }),
  /** Which PRODUCT.md §4.1 rules keep drafts from being published. */
  readiness: z.object({
    draftCount: count,
    /** Drafts that already satisfy every rule. */
    readyCount: count,
    /** Drafts blocked per (rule, path), most frequent first. A draft counts once per blocker. */
    blockers: z.array(z.object({ rule: z.enum(PUBLISH_RULES), path: z.string(), drafts: count })),
  }),
});
export type JobStatsDto = z.infer<typeof jobStatsDtoSchema>;
