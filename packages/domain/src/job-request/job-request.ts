import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { JOB_TITLE_MAX, JOB_TEXT_MAX, type JobContentInput, locationSchema } from '../job/content.js';
import { CUSTOM_ROLE, CUSTOM_ROLE_MAX, JOB_ROLE_CHOICES, SALARY_CURRENCIES, SENIORITY_LEVELS, WORK_MODES, type SalaryPeriod } from '../job/taxonomy.js';

export const JOB_REQUEST_STATUSES = ['submitted', 'approved', 'rejected', 'converted'] as const;
export type JobRequestStatus = (typeof JOB_REQUEST_STATUSES)[number];

export const HEADCOUNT_MAX = 100;
export const REQUEST_NOTE_MAX = 2000;

/** What a hiring manager fills in to ask for a position (PRODUCT.md §3.1). Budget is gross annual, in whole units. */
export const jobRequestInputSchema = z
  .object({
    title: z.string().trim().min(1).max(JOB_TITLE_MAX),
    role: z.enum(JOB_ROLE_CHOICES).optional(),
    /** The role in the person's words; required when `role` is `other`. */
    customRole: z.string().trim().min(1).max(CUSTOM_ROLE_MAX).optional(),
    seniority: z.enum(SENIORITY_LEVELS).optional(),
    reason: z.string().trim().min(1).max(JOB_TEXT_MAX),
    headcount: z.number().int().min(1).max(HEADCOUNT_MAX).default(1),
    salaryMin: z.number().int().positive(),
    salaryMax: z.number().int().positive(),
    currency: z.enum(SALARY_CURRENCIES).default('EUR'),
    workMode: z.enum(WORK_MODES).optional(),
    location: locationSchema.default({}),
    /** `YYYY-MM-DD`. */
    desiredStart: z.iso.date().optional(),
    processNotes: z.string().trim().max(REQUEST_NOTE_MAX).default(''),
    interviewersNotes: z.string().trim().max(REQUEST_NOTE_MAX).default(''),
    language: z.enum(SUPPORTED_LOCALES).default('it'),
  })
  .refine((value) => value.salaryMax >= value.salaryMin, { path: ['salaryMax'], message: 'salary_max_below_min' })
  .refine((value) => value.role !== CUSTOM_ROLE || value.customRole !== undefined, { path: ['customRole'], message: 'required' });
export type JobRequestInput = z.infer<typeof jobRequestInputSchema>;

export interface JobRequest extends Omit<JobRequestInput, 'location'> {
  readonly id: string;
  readonly organizationId: string;
  readonly requestedBy: string;
  readonly location: JobRequestInput['location'];
  readonly status: JobRequestStatus;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;
  /** The job made from the request, or the draft the request asks approval for. */
  readonly jobId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What an approver signed off: the job can be published only inside this range. */
export interface JobApproval {
  readonly approvedBy: string;
  readonly approvedAt: Date;
  readonly salaryMin: number;
  readonly salaryMax: number;
  readonly currency: (typeof SALARY_CURRENCIES)[number];
}

/** Codes of `publishJob` refusals tied to approval. */
export const APPROVAL_RULES = ['approval_required', 'approval_range_exceeded'] as const;
export type ApprovalRule = (typeof APPROVAL_RULES)[number];

interface SalaryLike {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly currency: string;
  /** Absent: yearly. */
  readonly period?: SalaryPeriod | undefined;
}

/**
 * How many of each period make a year, to compare an ad's salary with an annual budget: 12 months, 220 working days,
 * 1760 working hours (220 days of 8 hours).
 */
export const PERIODS_PER_YEAR: Readonly<Record<SalaryPeriod, number>> = { year: 1, month: 12, day: 220, hour: 1760 };

/** The gross annual amount of `amount` paid every `period`. */
export const toYearly = (amount: number, period: SalaryPeriod = 'year'): number => amount * PERIODS_PER_YEAR[period];

/**
 * `null` when the job may be published. Approval off: always null. Approval on: an approval must exist and the ad's
 * salary, made yearly, may not go beyond the approved (annual) maximum (a lower range stays inside the budget); another
 * currency is beyond.
 */
export function checkApproval(requireApproval: boolean, approval: JobApproval | null, salary: SalaryLike): ApprovalRule | null {
  if (!requireApproval) return null;
  if (approval === null) return 'approval_required';
  if (salary.currency !== approval.currency) return 'approval_range_exceeded';
  const top = salary.max ?? salary.min;
  return top !== undefined && toYearly(top, salary.period) > approval.salaryMax ? 'approval_range_exceeded' : null;
}

/** Draft content made from a request: only what the request really knows; the rest is for the hiring manager and the assistant. */
export function jobContentFromRequest(request: JobRequest): JobContentInput {
  return {
    title: request.title,
    language: request.language,
    ...(request.role === undefined ? {} : { role: request.role }),
    ...(request.customRole === undefined ? {} : { customRole: request.customRole }),
    ...(request.seniority === undefined ? {} : { seniority: request.seniority }),
    ...(request.workMode === undefined ? {} : { workMode: request.workMode }),
    salary: { min: request.salaryMin, max: request.salaryMax, currency: request.currency, period: 'year' },
    location: request.location,
  };
}
