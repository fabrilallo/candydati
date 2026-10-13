import { FEEDBACK_ANSWER_MAX, INTERVIEWER_NAME_MAX } from '@tt/domain'
import { z } from 'zod'
import {
  FEEDBACK_RECOMMENDATIONS,
  type FeedbackRecommendation,
  type FeedbackRequestDto,
  type FeedbackRequestInput,
  type FeedbackSubmission,
} from './phase9-contract'

/** Pure helpers of the interview feedback screens (phase 9): no score anywhere, only words and an opinion. */
export const isRecommendation = (value: unknown): value is FeedbackRecommendation =>
  typeof value === 'string' && (FEEDBACK_RECOMMENDATIONS as readonly string[]).includes(value)

export const recommendationKey = (recommendation: FeedbackRecommendation): string => `feedback.recommendation.${recommendation}`

export interface GroupedRequests {
  readonly pending: readonly FeedbackRequestDto[]
  readonly overdue: readonly FeedbackRequestDto[]
  readonly submitted: readonly FeedbackRequestDto[]
}

/** Requests by state; an expired link counts as overdue (nothing arrived and the link no longer works). */
export const groupRequests = (requests: readonly FeedbackRequestDto[]): GroupedRequests => ({
  pending: requests.filter((request) => request.state === 'pending'),
  overdue: requests.filter((request) => request.state === 'overdue' || request.state === 'expired'),
  submitted: requests.filter((request) => request.state === 'submitted'),
})

export type SubmitIssue = 'recommendation_required' | 'answers_required' | 'answer_too_long'

export interface SubmitCheck {
  readonly ok: boolean
  readonly issues: readonly SubmitIssue[]
  /** Question ids whose answer is over the limit. */
  readonly tooLong: readonly string[]
}

/** Whether the form can be sent: a recommendation, at least one answer with words, no answer over the limit. */
export const checkSubmission = (answers: Readonly<Record<string, string>>, recommendation: FeedbackRecommendation | null): SubmitCheck => {
  const tooLong = Object.entries(answers).filter(([, value]) => value.trim().length > FEEDBACK_ANSWER_MAX).map(([id]) => id)
  const issues: SubmitIssue[] = [
    ...(recommendation === null ? (['recommendation_required'] as const) : []),
    ...(Object.values(answers).some((value) => value.trim() !== '') ? [] : (['answers_required'] as const)),
    ...(tooLong.length > 0 ? (['answer_too_long'] as const) : []),
  ]
  return { ok: issues.length === 0, issues, tooLong }
}

/** The body sent: trimmed, empty answers left out, questions in the order shown. */
export const buildSubmission = (
  questionIds: readonly string[],
  answers: Readonly<Record<string, string>>,
  recommendation: FeedbackRecommendation,
): FeedbackSubmission => ({
  answers: Object.fromEntries(questionIds.map((questionId) => [questionId, (answers[questionId] ?? '').trim()]).filter(([, answer]) => answer !== '')),
  recommendation,
})

/** An external interviewer asked by hand: name and a valid email. */
export const externalInterviewerSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(INTERVIEWER_NAME_MAX),
  email: z.string().trim().pipe(z.email('email_invalid').max(254)),
})

export type RequestForm = { readonly stageId: string; readonly external: boolean; readonly name: string; readonly email: string }
export type RequestCheck =
  | { readonly ok: true; readonly input: FeedbackRequestInput }
  | { readonly ok: false; readonly errors: Readonly<Partial<Record<'stageId' | 'name' | 'email', string>>> }

/** Validates the "Chiedi feedback" dialog and builds the body (the stage's own interviewers when none is named). */
export const checkRequestForm = (form: RequestForm): RequestCheck => {
  if (form.stageId === '') return { ok: false, errors: { stageId: 'stage_required' } }
  if (!form.external) return { ok: true, input: { stageId: form.stageId } }
  const parsed = externalInterviewerSchema.safeParse({ name: form.name, email: form.email })
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message
    return { ok: false, errors }
  }
  return { ok: true, input: { stageId: form.stageId, interviewer: { kind: 'external', name: parsed.data.name, email: parsed.data.email } } }
}

/** What to call a stage in the feedback lists: the label the api sent, otherwise the stage of the application. */
export const feedbackStageName = (stageId: string, label: string | null, known: readonly { readonly id: string; readonly name: string }[]): string =>
  known.find((stage) => stage.id === stageId)?.name ?? label ?? ''
