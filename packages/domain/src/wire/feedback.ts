import { z } from 'zod';
import { FEEDBACK_RECOMMENDATIONS, INTERVIEWER_KINDS } from '../feedback/feedback.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { isoDate } from './common.js';

/**
 * Interview feedback on the wire. The api returns the core views as they are (Dates become ISO strings in JSON), so
 * these schemas describe exactly `StageInterviewersView`, `FeedbackRequestView`, `FeedbackView`, `PublicFeedbackView`.
 */

/** A stage interviewer as stored: members have a user id, externals an email (core returns the whole row). */
export const interviewerSchema = z.object({
  kind: z.enum(INTERVIEWER_KINDS),
  userId: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string(),
});
export type InterviewerDto = z.output<typeof interviewerSchema>;

export const stageInterviewersSchema = z.object({ stageId: z.string(), interviewers: z.array(interviewerSchema) });
export type StageInterviewersDto = z.output<typeof stageInterviewersSchema>;

/** `pending` until answered, `expired` once the link no longer works without an answer. */
export const FEEDBACK_REQUEST_STATUSES = ['pending', 'submitted', 'expired'] as const;
export type FeedbackRequestState = (typeof FEEDBACK_REQUEST_STATUSES)[number];

/** What a recruiter sees of a request (`FeedbackRequestView`): never the link nor its hash. */
export const feedbackRequestSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  stageId: z.string(),
  stageLabel: z.string(),
  interviewerKind: z.enum(INTERVIEWER_KINDS),
  interviewerName: z.string(),
  status: z.enum(FEEDBACK_REQUEST_STATUSES),
  remindersSent: z.number().int().nonnegative(),
  createdAt: isoDate,
  expiresAt: isoDate,
  submittedAt: isoDate.nullable(),
});
export type FeedbackRequestDto = z.output<typeof feedbackRequestSchema>;

/** One fixed question and its answer; `question` is the text of the stage's template in the ad's language. */
export const feedbackAnswerSchema = z.object({ questionId: z.string(), question: z.string(), answer: z.string() });

export const interviewFeedbackSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  stageId: z.string(),
  stageLabel: z.string(),
  interviewerName: z.string(),
  answers: z.array(feedbackAnswerSchema),
  recommendation: z.enum(FEEDBACK_RECOMMENDATIONS),
  submittedAt: isoDate,
});
export type InterviewFeedbackDto = z.output<typeof interviewFeedbackSchema>;

export const applicationFeedbackSchema = z.object({ requests: z.array(feedbackRequestSchema), feedback: z.array(interviewFeedbackSchema) });
export type ApplicationFeedbackDto = z.output<typeof applicationFeedbackSchema>;

export const feedbackQuestionSchema = z.object({ id: z.string(), label: z.string(), required: z.boolean() });

/** What the interviewer sees (`PublicFeedbackView`): only what the stage needs, nothing else about the candidate. */
export const publicFeedbackSchema = z.object({
  organizationName: z.string(),
  language: z.enum(SUPPORTED_LOCALES),
  interviewerName: z.string(),
  candidate: z.object({ firstName: z.string(), lastName: z.string() }),
  jobTitle: z.string(),
  stage: z.object({ label: z.string(), note: z.string().nullable() }),
  questions: z.array(feedbackQuestionSchema),
  recommendations: z.array(z.enum(FEEDBACK_RECOMMENDATIONS)),
  hasCv: z.boolean(),
  expiresAt: isoDate,
  /** Set once the link was used: the page shows what was written, read-only. */
  submission: z.object({ answers: z.record(z.string(), z.string()), recommendation: z.enum(FEEDBACK_RECOMMENDATIONS), submittedAt: isoDate }).nullable(),
});
export type PublicFeedbackDto = z.output<typeof publicFeedbackSchema>;
