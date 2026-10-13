import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import {
  CONTRACT_TYPES,
  JOB_ROLES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  SENIORITY_LEVELS,
  STAGE_CONDUCTORS,
  STAGE_TYPES,
  WORK_MODES,
} from './taxonomy.js';

export const JOB_TITLE_MAX = 120;
export const JOB_LINE_MAX = 300;
export const JOB_TEXT_MAX = 4000;
export const JOB_LIST_MAX = 30;
export const MIN_RESPONSIBILITIES = 3;
export const MAX_STAGES = 10;
export const MAX_RESPONSE_DAYS = 60;

const line = z.string().trim().min(1).max(JOB_LINE_MAX);
const lines = z.array(line).max(JOB_LIST_MAX);
const text = z.string().trim().max(JOB_TEXT_MAX);
const countryCode = z.string().regex(/^[A-Z]{2}$/, 'country_code');

/** Stable identity of a stage: candidates are attached to it, so it survives reordering and renaming. */
export const STAGE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
export const STAGE_TITLE_MAX = 80;

export const selectionStageSchema = z.object({
  /** Optional in input: the server assigns one to every stage without it. */
  id: z.string().regex(STAGE_ID_PATTERN, 'stage_id').optional(),
  /** Free title; when absent the type is shown. */
  title: z.string().trim().min(1).max(STAGE_TITLE_MAX).optional(),
  type: z.enum(STAGE_TYPES),
  /** Minutes the candidate should set aside (a take-home assignment counts its expected effort). */
  durationMinutes: z.number().int().min(5).max(60 * 24 * 5),
  conductedBy: z.enum(STAGE_CONDUCTORS),
  /** Optional detail shown to the candidate. */
  note: text.max(JOB_LINE_MAX).optional(),
});
export type SelectionStage = z.infer<typeof selectionStageSchema>;

/** Gross amounts in whole units of `currency`. */
export const salarySchema = z.object({
  min: z.number().int().positive().optional(),
  max: z.number().int().positive().optional(),
  currency: z.enum(SALARY_CURRENCIES).default('EUR'),
  period: z.enum(SALARY_PERIODS).default('year'),
});

export const locationSchema = z.object({
  /** ISO 3166-1 alpha-2 country of employment. */
  country: countryCode.optional(),
  city: z.string().trim().min(1).max(120).optional(),
  onsiteDaysPerWeek: z.number().int().min(1).max(7).optional(),
});

/**
 * What a draft may hold: only the title is required, everything else can be filled in later.
 * `publishableJobContentSchema` is the same shape with the rules of PLAN §5.1 switched on.
 */
export const jobContentSchema = z.object({
  title: z.string().trim().min(1).max(JOB_TITLE_MAX),
  /** Language the ad is written in. */
  language: z.enum(SUPPORTED_LOCALES).default('it'),
  role: z.enum(JOB_ROLES).optional(),
  seniority: z.enum(SENIORITY_LEVELS).optional(),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  salary: salarySchema.default({ currency: 'EUR', period: 'year' }),
  workMode: z.enum(WORK_MODES).optional(),
  location: locationSchema.default({}),
  process: z.array(selectionStageSchema).max(MAX_STAGES).default([]),
  /** Days within which the candidate hears back after each stage. */
  responseDays: z.number().int().min(1).max(MAX_RESPONSE_DAYS).optional(),
  summary: text.default(''),
  responsibilities: lines.default([]),
  requirements: z.object({ mustHave: lines.default([]), niceToHave: lines.default([]) }).default({ mustHave: [], niceToHave: [] }),
  technologies: lines.default([]),
  benefits: lines.default([]),
  growth: text.default(''),
  workLifeBalance: text.default(''),
  culture: text.default(''),
});
export type JobContent = z.infer<typeof jobContentSchema>;
export type JobContentInput = z.input<typeof jobContentSchema>;

/** Rule ids reported by `checkPublishable`. The apps translate them; they are part of the public API. */
export const PUBLISH_RULES = [
  'required',
  'salary_max_below_min',
  'city_required',
  'onsite_days_required',
  'too_few_stages',
  'too_few_responsibilities',
  'too_few_requirements',
] as const;
export type PublishRule = (typeof PUBLISH_RULES)[number];

export interface PublishIssue {
  /** Dot path inside the content, e.g. `salary.max`. */
  readonly path: string;
  readonly rule: PublishRule;
}

const requiredPaths = (content: JobContent): readonly string[] => {
  const missing: [string, unknown][] = [
    ['role', content.role],
    ['seniority', content.seniority],
    ['contractType', content.contractType],
    ['salary.min', content.salary.min],
    ['salary.max', content.salary.max],
    ['workMode', content.workMode],
    ['location.country', content.location.country],
    ['responseDays', content.responseDays],
  ];
  return missing.filter(([, value]) => value === undefined).map(([path]) => path);
};

/**
 * The deterministic block of PLAN §5.1: an empty result means the ad may be published. No model involved.
 * The quality score is a separate, non-blocking check.
 */
export function checkPublishable(content: JobContent): readonly PublishIssue[] {
  const issues: PublishIssue[] = requiredPaths(content).map((path) => ({ path, rule: 'required' }));
  const { salary, workMode, location } = content;
  if (salary.min !== undefined && salary.max !== undefined && salary.max < salary.min) {
    issues.push({ path: 'salary.max', rule: 'salary_max_below_min' });
  }
  if (workMode === 'hybrid' || workMode === 'onsite') {
    if (location.city === undefined) issues.push({ path: 'location.city', rule: 'city_required' });
    if (location.onsiteDaysPerWeek === undefined) issues.push({ path: 'location.onsiteDaysPerWeek', rule: 'onsite_days_required' });
  }
  if (content.process.length === 0) issues.push({ path: 'process', rule: 'too_few_stages' });
  if (content.responsibilities.length < MIN_RESPONSIBILITIES) issues.push({ path: 'responsibilities', rule: 'too_few_responsibilities' });
  if (content.requirements.mustHave.length === 0) issues.push({ path: 'requirements.mustHave', rule: 'too_few_requirements' });
  return issues;
}

export const isPublishable = (content: JobContent): boolean => checkPublishable(content).length === 0;

/** Content of a published ad: every §5.1 field is present. Used for typing public pages, feeds and JSON-LD. */
export type PublishedJobContent = JobContent & {
  readonly role: NonNullable<JobContent['role']>;
  readonly seniority: NonNullable<JobContent['seniority']>;
  readonly contractType: NonNullable<JobContent['contractType']>;
  readonly workMode: NonNullable<JobContent['workMode']>;
  readonly responseDays: number;
  readonly salary: JobContent['salary'] & { readonly min: number; readonly max: number };
  readonly location: JobContent['location'] & { readonly country: string };
};

export const isPublishedContent = (content: JobContent): content is PublishedJobContent => isPublishable(content);
