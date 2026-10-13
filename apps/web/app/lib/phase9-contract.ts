import { COMPLIANCE_BLOCKING_RULES, JOB_ROLES, jobContentSchema, SALARY_CURRENCIES, SENIORITY_LEVELS, WORK_MODES, type ComplianceBlockingRule, type JobContent, type JobDto } from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 9 wire shapes (HR tools: compliance, employment terms, interview feedback, job
 * requests and approval, stale ads). Domain and api are being written at the same time: whatever `@tt/domain`
 * exports replaces the matching piece here. Read leniently: unknown enum values fall back, missing fields default.
 */
const isoDate = z.iso.datetime({ offset: true })
const enc = (value: string): string => encodeURIComponent(value)
const known = <T extends string>(values: readonly T[], raw: unknown): raw is T => typeof raw === 'string' && (values as readonly string[]).includes(raw)
/** An enum read leniently: an unknown or missing value becomes `fallback` (a missing key included). */
const oneOf = <T extends string>(values: readonly T[], fallback: T) =>
  z
    .custom<T>()
    .optional()
    .transform((raw): T => (known(values, raw) ? raw : fallback))
const optionalOf = <T extends string>(values: readonly T[]) =>
  z
    .custom<T>()
    .optional()
    .transform((raw): T | null => (known(values, raw) ? raw : null))
const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)
const record = (raw: unknown): Record<string, unknown> | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null)
/** Accepts the api's DTO or the core view it is mapped from: `normalize` rewrites the second into the first. */
const lenient = <T extends z.ZodType>(normalize: (raw: Record<string, unknown>) => Record<string, unknown>, schema: T) =>
  z.preprocess((raw) => {
    const value = record(raw)
    return value ? normalize(value) : raw
  }, schema)
/** `interviewerName` and `interviewerKind` (core views) as the `interviewer` object. */
const withInterviewer = (raw: Record<string, unknown>): Record<string, unknown> =>
  raw.interviewer === undefined && typeof raw.interviewerName === 'string' ? { ...raw, interviewer: { kind: raw.interviewerKind ?? 'external', name: raw.interviewerName } } : raw

// A. Compliance and B. employment terms: from `@tt/domain` --------------------------------------------------------

export {
  CCNL_IDS,
  COMPLIANCE_BLOCKING_RULES,
  COMPLIANCE_WARNING_RULES,
  EXTRA_BENEFITS,
  MEAL_VOUCHER_TYPES,
  MONTHLY_PAYMENTS_MAX,
  MONTHLY_PAYMENTS_MIN,
  PROTECTED_CATEGORIES,
  checkCompliance,
  employmentSchema,
} from '@tt/domain'
export type { CcnlId, ComplianceBlockingRule, ComplianceIssue, Employment, ExtraBenefit, MealVoucherType, ProtectedCategories } from '@tt/domain'

export const isComplianceRule = (rule: string): rule is ComplianceBlockingRule => (COMPLIANCE_BLOCKING_RULES as readonly string[]).includes(rule)

/** One finding as the api sends it: blocking ones in `publishIssues`, doubtful ones in `complianceWarnings`. */
export const complianceIssueSchema = z
  .object({ rule: z.string(), path: z.string(), detail: z.object({ match: z.string(), suggestion: z.string() }) })
  .loose()
export type ComplianceIssueDto = z.output<typeof complianceIssueSchema>
export const complianceWarningsSchema = z.array(complianceIssueSchema).catch([])

/** The content schema now carries `employment` and `protectedCategories`: the aliases keep the screens readable. */
export const contentSchema9 = jobContentSchema
export type JobContent9 = JobContent

// C. Interviewers and feedback ---------------------------------------------------------------------------------------

export const INTERVIEWER_KINDS = ['member', 'external'] as const
export type InterviewerKind = (typeof INTERVIEWER_KINDS)[number]

export const interviewerSchema = z.object({
  kind: oneOf(INTERVIEWER_KINDS, 'external'),
  userId: nullableString,
  email: nullableString,
  name: z.string().default(''),
})
export type InterviewerDto = z.output<typeof interviewerSchema>
export const stageInterviewersSchema = z.object({ stageId: z.string(), interviewers: z.array(interviewerSchema).default([]) })
export type StageInterviewersDto = z.output<typeof stageInterviewersSchema>

export const jobInterviewersPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/interviewers`
/** Body of `PUT .../interviewers`: members by user id, externals by name and email. */
export interface InterviewerInput {
  readonly kind: InterviewerKind
  readonly userId?: string
  readonly email?: string
  readonly name: string
}

export const FEEDBACK_RECOMMENDATIONS = ['proceed', 'do_not_proceed', 'discuss'] as const
export type FeedbackRecommendation = (typeof FEEDBACK_RECOMMENDATIONS)[number]
export const FEEDBACK_REQUEST_STATES = ['pending', 'overdue', 'submitted', 'expired'] as const
export type FeedbackRequestState = (typeof FEEDBACK_REQUEST_STATES)[number]

/** One fixed question and its answer. `question` is the text shown at the time, so it survives template changes. */
export const feedbackAnswerSchema = z.object({ questionId: z.string(), question: z.string().default(''), answer: z.string().default('') })

const feedbackRequestObject = z.object({
  id: z.string(),
  stageId: z.string(),
  stageLabel: nullableString,
  interviewer: interviewerSchema,
  state: oneOf(FEEDBACK_REQUEST_STATES, 'pending'),
  requestedAt: isoDate,
  expiresAt: isoDate.nullable().default(null),
  submittedAt: isoDate.nullable().default(null),
})
export const feedbackRequestSchema = lenient(
  (raw) => ({ ...withInterviewer(raw), state: raw.state ?? raw.status, requestedAt: raw.requestedAt ?? raw.createdAt }),
  feedbackRequestObject,
)
export type FeedbackRequestDto = z.output<typeof feedbackRequestObject>

const interviewFeedbackObject = z.object({
  id: z.string(),
  stageId: z.string(),
  stageLabel: nullableString,
  stageType: nullableString,
  interviewer: interviewerSchema,
  answers: z.array(feedbackAnswerSchema).default([]),
  recommendation: optionalOf(FEEDBACK_RECOMMENDATIONS),
  submittedAt: isoDate,
})
export const interviewFeedbackSchema = lenient(withInterviewer, interviewFeedbackObject)
export type InterviewFeedbackDto = z.output<typeof interviewFeedbackObject>

export const applicationFeedbackSchema = z.object({
  requests: z.array(feedbackRequestSchema).default([]),
  feedback: z.array(interviewFeedbackSchema).default([]),
})
export type ApplicationFeedbackDto = z.output<typeof applicationFeedbackSchema>

export const applicationFeedbackPath = (applicationId: string): string => `/api/v1/applications/${enc(applicationId)}/feedback`
export const requestFeedbackPath = (applicationId: string): string => `${applicationFeedbackPath(applicationId)}/request`
/** Body of `POST .../feedback/request`: the current stage and its interviewers when both are omitted. */
export interface FeedbackRequestInput {
  readonly stageId?: string
  readonly interviewer?: InterviewerInput
}

export const publicFeedbackPath = (token: string): string => `/api/v1/public/feedback/${enc(token)}`
export const publicFeedbackCvPath = (token: string): string => `${publicFeedbackPath(token)}/cv`

export const feedbackQuestionSchema = z.object({ id: z.string(), label: z.string(), hint: nullableString })
export type FeedbackQuestionDto = z.output<typeof feedbackQuestionSchema>

/** What the interviewer sees: only what the stage needs, nothing else about the candidate. */
const publicFeedbackObject = z.object({
  /** Language of the questions (the organization's). */
  language: z.string().default('it'),
  organization: z.object({ name: z.string() }),
  candidate: z.object({ firstName: z.string(), lastName: z.string() }),
  job: z.object({ title: z.string() }),
  stage: z.object({ label: nullableString, type: nullableString, note: nullableString }),
  interviewerName: nullableString,
  questions: z.array(feedbackQuestionSchema).default([]),
  /** True when a PDF CV can be shown inline through the token-scoped url. */
  hasCv: z.boolean().default(false),
  expiresAt: isoDate.nullable().default(null),
  /** The link was already used: the page thanks instead of asking again. */
  submitted: z.boolean().default(false),
})
export const publicFeedbackSchema = lenient(
  (raw) => ({
    ...raw,
    organization: raw.organization ?? { name: raw.organizationName ?? '' },
    job: raw.job ?? { title: raw.jobTitle ?? '' },
    submitted: raw.submitted ?? (record(raw.submission) !== null),
  }),
  publicFeedbackObject,
)
export type PublicFeedbackDto = z.output<typeof publicFeedbackObject>

/** Body of the public submission (domain `feedbackSubmissionSchema`, strict): answers by question id. */
export interface FeedbackSubmission {
  readonly answers: Readonly<Record<string, string>>
  readonly recommendation: FeedbackRecommendation
}

// D. Job requests and approval ---------------------------------------------------------------------------------------

export const JOB_REQUEST_STATUSES = ['submitted', 'approved', 'rejected', 'converted'] as const
export type JobRequestStatus = (typeof JOB_REQUEST_STATUSES)[number]

const personRef = z.object({ id: z.string(), name: nullableString }).nullable().default(null)

const jobRequestObject = z.object({
  id: z.string(),
  title: z.string(),
  role: optionalOf(JOB_ROLES),
  seniority: optionalOf(SENIORITY_LEVELS),
  reason: z.string().default(''),
  headcount: z.number().int().positive().default(1),
  salaryMin: nullableNumber,
  salaryMax: nullableNumber,
  currency: oneOf(SALARY_CURRENCIES, 'EUR'),
  workMode: optionalOf(WORK_MODES),
  location: nullableString,
  desiredStart: nullableString,
  processNotes: nullableString,
  interviewersNotes: nullableString,
  status: oneOf(JOB_REQUEST_STATUSES, 'submitted'),
  requestedBy: personRef,
  decidedBy: personRef,
  decidedAt: isoDate.nullable().default(null),
  decisionNote: nullableString,
  jobId: nullableString,
  createdAt: isoDate,
})
/** A person as a bare id (core entity) or `{ id, name }` (api DTO). */
const person = (raw: unknown): unknown => (typeof raw === 'string' ? { id: raw, name: null } : raw)
/** The domain location (`{ city, country }`) read as the line the screens show. */
const placeOf = (raw: unknown): unknown => {
  const value = record(raw)
  if (value === null) return raw
  const line = [value.city, value.country].filter((part) => typeof part === 'string' && part !== '').join(', ')
  return line === '' ? null : line
}
export const jobRequestSchema = lenient(
  (raw) => ({ ...raw, location: placeOf(raw.location), requestedBy: person(raw.requestedBy), decidedBy: person(raw.decidedBy), processNotes: raw.processNotes || null, interviewersNotes: raw.interviewersNotes || null }),
  jobRequestObject,
)
export type JobRequestDto = z.output<typeof jobRequestObject>

export const JOB_REQUESTS_PATH = '/api/v1/job-requests'
export const jobRequestPath = (id: string): string => `${JOB_REQUESTS_PATH}/${enc(id)}`
export const approveJobRequestPath = (id: string): string => `${jobRequestPath(id)}/approve`
export const rejectJobRequestPath = (id: string): string => `${jobRequestPath(id)}/reject`
export const convertJobRequestPath = (id: string): string => `${jobRequestPath(id)}/convert`

export interface JobRequestInput {
  readonly title: string
  readonly role?: string
  readonly seniority?: string
  readonly reason: string
  readonly headcount: number
  readonly salaryMin: number
  readonly salaryMax: number
  readonly currency: string
  readonly workMode?: string
  readonly location?: { readonly city?: string; readonly country?: string }
  readonly desiredStart?: string
  readonly processNotes?: string
  readonly interviewersNotes?: string
}

export const APPROVAL_SETTINGS_PATH = '/api/v1/settings/approval'
export const approvalSettingsSchema = z.object({ requireApproval: z.boolean().default(false) })
export type ApprovalSettingsDto = z.output<typeof approvalSettingsSchema>

/** Carried by a job created from an approved request (or approved directly). `approvedBy` may be a bare user id. */
export const jobApprovalSchema = z
  .preprocess(
    (raw) => {
      const value = record(raw)
      return value && typeof value.approvedBy === 'string' ? { ...value, approvedBy: { id: value.approvedBy, name: null } } : raw
    },
    z.object({ approvedBy: personRef, approvedAt: isoDate, salaryMin: z.number(), salaryMax: z.number(), requestId: nullableString }).nullable(),
  )
  .catch(null)
  .default(null)

/** `GET /api/v1/jobs/:id/approval`: does the organization ask for approval, and does this job have one. */
export const jobApprovalPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/approval`
export const jobApprovalRequestPath = (jobId: string): string => `/api/v1/jobs/${enc(jobId)}/approval-request`
export const jobApprovalStatusSchema = z.object({ requireApproval: z.boolean(), approval: jobApprovalSchema, publishable: z.boolean().default(true) })
export type JobApprovalStatusDto = z.output<typeof jobApprovalStatusSchema>
export type JobApprovalDto = z.output<typeof jobApprovalSchema>

/** What `GET /api/v1/jobs/:id` carries in Phase 9 (read by `jobSchema`). */
export type JobDto9 = JobDto & { readonly complianceWarnings?: readonly ComplianceIssueDto[]; readonly approval?: JobApprovalDto }

/** Publish refusals of Phase 9 (the error code of the failed envelope). */
export const APPROVAL_REQUIRED = 'approval_required'
export const APPROVAL_RANGE_EXCEEDED = 'approval_range_exceeded'

// E. Stale ads -------------------------------------------------------------------------------------------------------

export const STALE_JOB_DAYS = 90
export const STALE_JOBS_PATH = '/api/v1/jobs/stale'
const staleJobObject = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: isoDate.nullable().default(null),
  lastActivityAt: isoDate,
  daysSinceActivity: z.number().int().nonnegative(),
  openApplications: z.number().int().nonnegative().default(0),
})
/** The core view (`{ job, lastActivityAt, daysIdle }`) or the flat DTO. */
export const staleJobSchema = lenient((raw) => {
  const job = record(raw.job)
  const content = record(job?.content)
  return job === null
    ? raw
    : { ...raw, id: job.id, title: job.title ?? content?.title ?? '', publishedAt: job.publishedAt ?? null, daysSinceActivity: raw.daysSinceActivity ?? raw.daysIdle }
}, staleJobObject)
export type StaleJobDto = z.output<typeof staleJobObject>

// Permissions --------------------------------------------------------------------------------------------------------

/**
 * New permissions of Phase 9, until `@tt/domain` declares them: `feedback:manage` (owner, admin, recruiter,
 * hiring_manager), `feedback:read` (whoever reads candidates), `job:approve` (owner, admin).
 */
export const PHASE9_GRANTS = {
  'feedback:manage': ['owner', 'admin', 'recruiter', 'hiring_manager'],
  'feedback:read': ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'],
  'job:approve': ['owner', 'admin'],
} as const
export type Phase9Permission = keyof typeof PHASE9_GRANTS

/** Pure: whether a role holds a Phase 9 permission (the screens call this, never the table above). */
export const canPhase9 = (role: string | null, permission: Phase9Permission): boolean =>
  role !== null && (PHASE9_GRANTS[permission] as readonly string[]).includes(role)
