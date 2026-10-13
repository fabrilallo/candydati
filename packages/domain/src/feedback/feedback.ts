import { z } from 'zod';
import type { Locale } from '../platform/config.js';
import { feedbackQuestionsFor } from './templates.js';
import type { StageType } from '../job/taxonomy.js';

export const FEEDBACK_ANSWER_MAX = 2000;
export const FEEDBACK_TOKEN_TTL_DAYS = 14;
/** Reminders go out when a request is still empty after these many days (first, second). */
export const FEEDBACK_REMINDER_DAYS = [2, 5] as const;
export const INTERVIEWERS_PER_STAGE_MAX = 5;
export const INTERVIEWER_NAME_MAX = 120;

/** An opinion for the person who decides: it is not a score and it decides nothing (PRODUCT.md §2, principle 4). */
export const FEEDBACK_RECOMMENDATIONS = ['proceed', 'do_not_proceed', 'discuss'] as const;
export type FeedbackRecommendation = (typeof FEEDBACK_RECOMMENDATIONS)[number];

export const INTERVIEWER_KINDS = ['member', 'external'] as const;
export type InterviewerKind = (typeof INTERVIEWER_KINDS)[number];

/** Who is asked for feedback on a stage of a job. A member has a user id; an external person has an email. */
export const interviewerInputSchema = z
  .object({
    kind: z.enum(INTERVIEWER_KINDS),
    userId: z.string().min(1).optional(),
    email: z.email().max(254).optional(),
    name: z.string().trim().min(1).max(INTERVIEWER_NAME_MAX).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'member' && value.userId === undefined) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'user_required' });
    if (value.kind === 'external') {
      if (value.email === undefined) ctx.addIssue({ code: 'custom', path: ['email'], message: 'email_required' });
      if (value.name === undefined) ctx.addIssue({ code: 'custom', path: ['name'], message: 'name_required' });
    }
  });
export type InterviewerInput = z.infer<typeof interviewerInputSchema>;

export interface StageInterviewer {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly kind: InterviewerKind;
  readonly userId: string | null;
  /** Lowercase; for members it is filled when the request is made. */
  readonly email: string | null;
  readonly name: string;
  readonly createdAt: Date;
}

export interface FeedbackRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly interviewerKind: InterviewerKind;
  readonly interviewerUserId: string | null;
  readonly interviewerEmail: string;
  readonly interviewerName: string;
  /** Hash of the secret in the link; the secret itself is never stored. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly remindersSent: number;
  readonly lastReminderAt: Date | null;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly submittedAt: Date | null;
}

export interface InterviewFeedback {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly requestId: string;
  readonly stageId: string;
  readonly interviewerName: string;
  /** Answers by question id. */
  readonly answers: Readonly<Record<string, string>>;
  readonly recommendation: FeedbackRecommendation;
  readonly submittedAt: Date;
}

export type FeedbackRequestStatus = 'pending' | 'submitted' | 'expired';

export const feedbackRequestStatus = (request: Pick<FeedbackRequest, 'submittedAt' | 'expiresAt'>, now: Date): FeedbackRequestStatus =>
  request.submittedAt !== null ? 'submitted' : request.expiresAt <= now ? 'expired' : 'pending';

/**
 * What an interviewer sends. Strict on purpose: any extra field (`score`, `rating`, ...) is refused, so no mark about
 * a person can enter through this form.
 */
export const feedbackSubmissionSchema = z.strictObject({
  answers: z.record(z.string().min(1).max(60), z.string().max(FEEDBACK_ANSWER_MAX)),
  recommendation: z.enum(FEEDBACK_RECOMMENDATIONS),
});
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

export interface AnswerIssue {
  readonly path: string;
  readonly message: 'unknown_question' | 'required';
}

/** Answers must belong to the stage's questions and the required ones must not be blank. Returns trimmed non-empty answers. */
export function checkAnswers(
  stageType: StageType | null,
  answers: Readonly<Record<string, string>>,
): { readonly answers: Readonly<Record<string, string>>; readonly issues: readonly AnswerIssue[] } {
  const questions = feedbackQuestionsFor(stageType);
  const known = new Set(questions.map((question) => question.id));
  const issues: AnswerIssue[] = Object.keys(answers)
    .filter((id) => !known.has(id))
    .map((id) => ({ path: `answers.${id}`, message: 'unknown_question' }));
  for (const question of questions) {
    if (question.required && (answers[question.id] ?? '').trim() === '') issues.push({ path: `answers.${question.id}`, message: 'required' });
  }
  const kept = Object.fromEntries(
    Object.entries(answers)
      .filter(([id]) => known.has(id))
      .map(([id, value]) => [id, value.trim()] as const)
      .filter(([, value]) => value !== ''),
  );
  return { answers: kept, issues };
}

/** Public path of the form; the link is `${platformUrl}${path}`. */
export const feedbackPath = (token: string): string => `/feedback/${token}`;

export interface FeedbackEmailInput {
  readonly locale: Locale;
  readonly interviewerName: string;
  readonly candidateName: string;
  readonly jobTitle: string;
  readonly stageLabel: string;
  readonly organizationName: string;
  readonly link: string;
  readonly expiresAt: Date;
  readonly reminder: boolean;
}

const dateOf = (date: Date): string => date.toISOString().slice(0, 10);

/** Plain text subject and body of the request. It goes to the interviewer, who sees the candidate's name anyway. */
export function buildFeedbackEmail(input: FeedbackEmailInput): { readonly subject: string; readonly text: string } {
  const { interviewerName, candidateName, jobTitle, stageLabel, organizationName, link, expiresAt } = input;
  if (input.locale === 'it') {
    return {
      subject: `${input.reminder ? 'Promemoria: ' : ''}Feedback su ${candidateName} per ${jobTitle}`,
      text: [
        `Ciao ${interviewerName},`,
        `${organizationName} ti chiede un breve feedback sul colloquio con ${candidateName} (${jobTitle}, fase: ${stageLabel}).`,
        `Bastano pochi minuti, anche da telefono, senza account: ${link}`,
        `Il link è personale e vale fino al ${dateOf(expiresAt)}. Il feedback descrive quello che hai visto: non dà un voto al candidato.`,
      ].join('\n\n'),
    };
  }
  return {
    subject: `${input.reminder ? 'Reminder: ' : ''}Feedback on ${candidateName} for ${jobTitle}`,
    text: [
      `Hi ${interviewerName},`,
      `${organizationName} is asking for brief feedback on the interview with ${candidateName} (${jobTitle}, stage: ${stageLabel}).`,
      `It takes a few minutes, from your phone too, with no account: ${link}`,
      `The link is personal and valid until ${dateOf(expiresAt)}. The feedback describes what you saw: it does not score the candidate.`,
    ].join('\n\n'),
  };
}
