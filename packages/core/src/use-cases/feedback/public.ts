import {
  checkAnswers,
  feedbackQuestionsFor,
  feedbackSubmissionSchema,
  FEEDBACK_RECOMMENDATIONS,
  localizeQuestions,
  type Application,
  type FeedbackRecommendation,
  type FeedbackRequest,
  type Job,
  type LocalizedQuestion,
  type Locale,
} from '@tt/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import type { PublicFeedbackDeps } from '../../feedback-ports.js';
import { definePublicFeedbackCommand, definePublicFeedbackQuery } from './define.js';
import { FEEDBACK_PAGE_ACTOR_ID, stageContextOf } from './shared.js';
import { sequential } from '../../sequential.js';

const tokenInput = z.object({ token: z.string().min(16).max(200) });
const NOT_VALID = 'This link is not valid.';

interface Resolved {
  readonly request: FeedbackRequest;
  readonly application: Application;
  readonly job: Job;
}

/**
 * Unknown and expired links, and links of applications that are gone or not visible, are all "not found": nothing says
 * whether the link ever existed. Expiry always applies, also after submission: a forwarded link must not open the CV forever.
 */
async function resolve(deps: PublicFeedbackDeps, secret: string): Promise<Resolved> {
  const request = await deps.feedbackRequests.findByTokenHash(deps.hash(secret));
  if (!request || request.expiresAt <= deps.now()) throw new NotFoundError(NOT_VALID);
  const application = await deps.applications.findById(request.organizationId, request.applicationId);
  const job = await deps.jobs.findById(request.organizationId, request.jobId);
  if (!application || !job || application.consentStatus !== 'given') throw new NotFoundError(NOT_VALID);
  return { request, application, job };
}

/** What the interviewer reads. Only what they need to talk about the person: no email, phone, notes, tags or other stages. */
export interface PublicFeedbackView {
  readonly organizationName: string;
  readonly language: Locale;
  readonly interviewerName: string;
  readonly candidate: { readonly firstName: string; readonly lastName: string };
  readonly jobTitle: string;
  readonly stage: { readonly label: string; readonly note: string | null };
  readonly questions: readonly LocalizedQuestion[];
  readonly recommendations: readonly FeedbackRecommendation[];
  readonly hasCv: boolean;
  readonly expiresAt: Date;
  /** Set once the interviewer has submitted: the form is read-only and shows what they wrote. */
  readonly submission: {
    readonly answers: Readonly<Record<string, string>>;
    readonly recommendation: FeedbackRecommendation;
    readonly submittedAt: Date;
  } | null;
}

export const getFeedbackRequest = definePublicFeedbackQuery({
  name: 'getFeedbackRequest',
  input: tokenInput,
  handler: async ({ deps, input }): Promise<PublicFeedbackView> => {
    const { request, application, job } = await resolve(deps, input.token);
    const [candidate, organization, feedback] = await sequential(
      () => deps.candidates.findById(request.organizationId, application.candidateId),
      () => deps.organizations.findById(request.organizationId),
      async () => (request.submittedAt === null ? null : await deps.interviewFeedback.findByRequest(request.organizationId, request.id)),
    );
    if (!candidate || !organization) throw new NotFoundError(NOT_VALID);
    const stage = stageContextOf(job, request.stageId);
    return {
      organizationName: organization.name,
      language: job.content.language,
      interviewerName: request.interviewerName,
      candidate: { firstName: candidate.firstName, lastName: candidate.lastName },
      jobTitle: job.content.title,
      stage: { label: stage.label, note: stage.declared?.note ?? null },
      questions: localizeQuestions(feedbackQuestionsFor(stage.declared?.type ?? null), job.content.language),
      recommendations: FEEDBACK_RECOMMENDATIONS,
      hasCv: application.cv.key !== '',
      expiresAt: request.expiresAt,
      submission: feedback ? { answers: feedback.answers, recommendation: feedback.recommendation, submittedAt: feedback.submittedAt } : null,
    };
  },
});

export interface FeedbackCvFile {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: string;
  /** True for PDF: the page may show it inline; other types are a download. */
  readonly inlineable: boolean;
}

/** The candidate's CV for the interviewer who holds the link, audited as `feedback.cv_opened` (ids only). */
export const openFeedbackCv = definePublicFeedbackCommand({
  name: 'openFeedbackCv',
  input: tokenInput,
  actorId: FEEDBACK_PAGE_ACTOR_ID,
  audit: { skip: 'appended by the handler in the command transaction: the event needs ids the result does not carry' },
  handler: async ({ deps, input, actor }): Promise<FeedbackCvFile> => {
    const { request, application } = await resolve(deps, input.token);
    let bytes: Uint8Array;
    try {
      bytes = await deps.files.get(application.cv.key);
    } catch {
      throw new NotFoundError('The CV is not available.');
    }
    await deps.auditLog.append({
      organizationId: request.organizationId,
      actor,
      action: 'feedback.cv_opened',
      target: { type: 'feedback_request', id: request.id },
      metadata: { applicationId: application.id },
    });
    return { bytes, fileName: application.cv.fileName, mediaType: application.cv.mediaType, inlineable: application.cv.mediaType === 'application/pdf' };
  },
});

const submitInput = z.strictObject({ token: tokenInput.shape.token, answers: feedbackSubmissionSchema.shape.answers, recommendation: feedbackSubmissionSchema.shape.recommendation });

export interface SubmitFeedbackResult {
  readonly submittedAt: Date;
}

/**
 * Single use: one submission per link, then the link is read-only. Answers must belong to the stage's questions and the
 * required ones must be filled. There is no score and nothing else is accepted (the input is strict).
 */
export const submitFeedback = definePublicFeedbackCommand({
  name: 'submitFeedback',
  input: submitInput,
  actorId: FEEDBACK_PAGE_ACTOR_ID,
  audit: { skip: 'appended by the handler in the command transaction: the event needs ids the result does not carry' },
  handler: async ({ deps, input, actor }): Promise<SubmitFeedbackResult> => {
    const { request, application, job } = await resolve(deps, input.token);
    if (request.submittedAt !== null) throw new ConflictError('already_submitted');
    const stage = stageContextOf(job, request.stageId);
    const checked = checkAnswers(stage.declared?.type ?? null, input.answers);
    if (checked.issues.length > 0) throw new ValidationError(checked.issues.map((issue) => ({ path: issue.path, message: issue.message })));
    const submittedAt = deps.now();
    // Single use: the guarded mark and the unique request id both decide a race between two submissions of the link.
    if (!(await deps.feedbackRequests.markSubmitted(request.organizationId, request.id, submittedAt))) throw new ConflictError('already_submitted');
    await deps.interviewFeedback.create({
      id: deps.newId(),
      organizationId: request.organizationId,
      applicationId: application.id,
      requestId: request.id,
      stageId: request.stageId,
      interviewerName: request.interviewerName,
      answers: checked.answers,
      recommendation: input.recommendation,
      submittedAt,
    });
    await deps.auditLog.append({
      organizationId: request.organizationId,
      actor,
      action: 'feedback.submitted',
      target: { type: 'feedback_request', id: request.id },
      metadata: { applicationId: application.id, stageId: request.stageId, recommendation: input.recommendation },
    });
    return { submittedAt };
  },
});
