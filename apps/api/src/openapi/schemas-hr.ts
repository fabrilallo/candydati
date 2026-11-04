import {
  FEEDBACK_RECOMMENDATIONS,
  INTERVIEWER_KINDS,
  JOB_REQUEST_STATUSES,
  OBSERVATIONS,
  SUPPORTED_LOCALES,
  criterionObservationWireSchema,
  jobRequestInputSchema,
  jobScorecardSchema,
  observationsInputSchema,
  scorecardCriteriaInputSchema,
  scorecardRowSchema,
  suggestScorecardResultSchema,
} from '@candydati/domain';
import { z } from 'zod';
import { jobSummarySchema } from './schemas-jobs.js';

const isoDate = z.iso.datetime();

export const stageInterviewersSchema = z.object({
  stageId: z.string(),
  interviewers: z.array(
    z.object({
      id: z.string(),
      stageId: z.string(),
      kind: z.enum(INTERVIEWER_KINDS),
      userId: z.string().nullable(),
      email: z.string().nullable(),
      name: z.string(),
      createdAt: isoDate,
    }),
  ),
});

export const feedbackRequestViewSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  stageId: z.string(),
  stageLabel: z.string(),
  interviewerKind: z.enum(INTERVIEWER_KINDS),
  interviewerName: z.string(),
  status: z.enum(['pending', 'submitted', 'expired']),
  remindersSent: z.number().int(),
  createdAt: isoDate,
  expiresAt: isoDate,
  submittedAt: isoDate.nullable(),
});

export const applicationFeedbackSchema = z.object({
  requests: z.array(feedbackRequestViewSchema),
  feedback: z.array(
    z.object({
      id: z.string(),
      requestId: z.string(),
      stageId: z.string(),
      stageLabel: z.string(),
      interviewerName: z.string(),
      answers: z.array(z.object({ questionId: z.string(), question: z.string(), answer: z.string() })),
      recommendation: z.enum(FEEDBACK_RECOMMENDATIONS).describe('An opinion for the person who decides, never a score of the candidate.'),
      observations: z.array(criterionObservationWireSchema).describe('One per criterion of the scorecard asked at the stage: a word and the evidence, never a number.'),
      submittedAt: isoDate,
    }),
  ),
  restrictedStageIds: z
    .array(z.string())
    .describe('Restricted stages of the job. Feedback from them is listed only for owners, admins, the hiring manager of the job and its author; others get nothing of it.'),
  scorecard: z
    .array(scorecardRowSchema)
    .describe('The criteria of the scorecard with each interviewer\'s evidence side by side. Nothing is counted, totalled or ranked.'),
});

export const publicFeedbackSchema = z.object({
  organizationName: z.string(),
  language: z.enum(SUPPORTED_LOCALES),
  interviewerName: z.string(),
  candidate: z.object({ firstName: z.string(), lastName: z.string() }),
  jobTitle: z.string(),
  stage: z.object({ label: z.string(), note: z.string().nullable() }),
  questions: z.array(z.object({ id: z.string(), label: z.string(), required: z.boolean().optional() }).loose()),
  criteria: z.array(z.object({ id: z.string(), label: z.string() })).describe('The evaluation criteria of the job asked at this stage.'),
  observations: z.array(z.enum(OBSERVATIONS)),
  recommendations: z.array(z.enum(FEEDBACK_RECOMMENDATIONS)),
  hasCv: z.boolean(),
  expiresAt: isoDate,
  submission: z
    .object({ answers: z.record(z.string(), z.string()), recommendation: z.enum(FEEDBACK_RECOMMENDATIONS), observations: z.array(criterionObservationWireSchema), submittedAt: isoDate })
    .nullable(),
});

export const submitFeedbackBody = z.strictObject({
  answers: z.record(z.string(), z.string().max(2000)),
  recommendation: z.enum(FEEDBACK_RECOMMENDATIONS),
  observations: observationsInputSchema.optional().describe('Required for every criterion of the scorecard asked at the stage: `observed`, `not_observed` or `to_explore`, with evidence.'),
});

export { jobScorecardSchema, suggestScorecardResultSchema };
export const scorecardBody = z.strictObject({ criteria: scorecardCriteriaInputSchema });

export const jobRequestSchema = z.object({
  ...jobRequestInputSchema.shape,
  id: z.string(),
  requestedBy: z.string(),
  status: z.enum(JOB_REQUEST_STATUSES),
  decidedBy: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  decisionNote: z.string().nullable(),
  jobId: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const approvalSettingSchema = z.object({ requireApproval: z.boolean() });

export const jobApprovalStatusSchema = z.object({
  requireApproval: z.boolean(),
  approval: z.object({ approvedBy: z.string(), approvedAt: isoDate, salaryMin: z.number(), salaryMax: z.number(), currency: z.string() }).nullable(),
  publishable: z.boolean(),
});

export const staleJobSchema = z.object({ job: jobSummarySchema, lastActivityAt: isoDate, daysIdle: z.number().int() });
