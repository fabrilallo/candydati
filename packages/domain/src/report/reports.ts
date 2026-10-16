import { z } from 'zod';
import { DAY_MS } from '../response/response-state.js';
import type { Outcome } from '../candidate/application.js';
import type { StageType } from '../job/taxonomy.js';
import type { DurationStat, Rate } from './stats.js';

export type FunnelStageType = StageType | 'received';

/** Maximum span of a report, to keep the aggregates cheap. */
export const REPORT_MAX_DAYS = 800;

export const reportQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    jobId: z.string().min(1).optional(),
  })
  .refine((q) => q.from <= q.to, { message: 'from_after_to', path: ['from'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= REPORT_MAX_DAYS * DAY_MS, { message: 'period_too_long', path: ['to'] });
export type ReportQuery = z.input<typeof reportQuerySchema>;

export type OutcomeCounts = { readonly [O in Outcome]: number };

export interface JobRef {
  readonly jobId: string;
  readonly title: string;
}

export interface FunnelStageDto {
  /** With a job filter: 0 is `received`, then the declared stages in order. Null when aggregated by type (all jobs). */
  readonly position: number | null;
  /** The job's stable stage id (job filter only). */
  readonly stageId: string | null;
  /** Title declared on the stage, when present (job filter only). */
  readonly title: string | null;
  readonly type: FunnelStageType;
  /** Applications that entered the stage during the period. */
  readonly entered: number;
  /**
   * Cohort conversion: of the applications that entered this stage in the period, how many later entered the next stage of
   * the same job (hired, after the last stage). Never above 1. Total 0 when nobody entered.
   */
  readonly conversionToNext: Rate | null;
}

export interface SourceRow {
  readonly origin: string;
  readonly applications: number;
  readonly hires: number;
  readonly visits: number;
  readonly conversion: number | null;
}

/**
 * Numbers of the period. Rates carry their denominator; the interface shows "—" under `minSample`. Time figures are
 * rounded to 2 decimals. Applications erased under GDPR are gone from every aggregate.
 */
export interface ReportsDto {
  readonly generatedAt: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly jobId: string | null;
  readonly minSample: number;
  /** Applications decided `hired` in the period: days from application to decision. */
  readonly timeToHire: {
    readonly overall: DurationStat;
    readonly byJob: readonly (JobRef & DurationStat)[];
  };
  /** Jobs whose first hire falls in the period: days from publication to that hire. */
  readonly timeToFill: {
    readonly overall: DurationStat;
    readonly items: readonly (JobRef & { readonly publishedAt: string; readonly firstHireAt: string; readonly days: number })[];
  };
  readonly funnel: {
    readonly stages: readonly FunnelStageDto[];
    readonly outcomes: OutcomeCounts;
    readonly outcomesByJob: readonly (JobRef & OutcomeCounts)[];
  };
  /**
   * Applications received in the period by origin, hires decided in the period, and visits of the public job page
   * (aggregate counts, `job_view_daily`). `conversion` is applications over visits, null without visits.
   */
  readonly sources: readonly SourceRow[];
  /** The same figures per origin and `utm_campaign`, for the applications and visits that carried a campaign. */
  readonly campaigns: readonly (SourceRow & { readonly campaign: string })[];
  readonly responses: {
    /** Promises closed in the period (answered, or missed at their deadline). */
    readonly closed: Rate;
    readonly kept: number;
    readonly missed: number;
    /** Hours from the start of the promise to the answer. */
    readonly responseHours: DurationStat;
    /** Promises still waiting for an answer now, and those among them already past due. */
    readonly open: number;
    readonly overdue: number;
    readonly byJob: readonly (JobRef & { readonly kept: number; readonly missed: number; readonly keptRate: Rate })[];
    readonly byStageType: readonly { readonly type: FunnelStageType; readonly kept: number; readonly missed: number; readonly keptRate: Rate }[];
  };
  /** Applications received in the period for jobs that are closed or published 60+ days ago: how many have an outcome. */
  readonly outcomeCoverage: Rate;
}

/** Jobs counted by `outcomeCoverage`: closed, or published at least this many days ago. */
export const COVERAGE_JOB_AGE_DAYS = 60;
