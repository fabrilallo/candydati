import {
  checkAnswers,
  FEEDBACK_ANSWER_MAX,
  FEEDBACK_TEMPLATES,
  INTERVIEWER_NAME_MAX,
  STAGE_TYPES,
  type FeedbackRecommendation,
  type FeedbackRequestDto,
  type FeedbackSubmission,
  type InterviewerInput,
  type StageType,
} from '@candydati/domain'
import { z } from 'zod'

/** Pure helpers of the interview feedback screens (phase 9): no score anywhere, only words and an opinion. */
export const recommendationKey = (recommendation: FeedbackRecommendation): string => `feedback.recommendation.${recommendation}`

/** Body of `POST /applications/:id/feedback/request`: the current stage and its interviewers when both are omitted. */
export interface FeedbackRequestInput {
  readonly stageId?: string
  readonly interviewer?: InterviewerInput
}

export interface GroupedRequests {
  readonly pending: readonly FeedbackRequestDto[]
  readonly overdue: readonly FeedbackRequestDto[]
  readonly submitted: readonly FeedbackRequestDto[]
}

/** Requests by status; an expired link counts as overdue (nothing arrived and the link no longer works). */
export const groupRequests = (requests: readonly FeedbackRequestDto[]): GroupedRequests => ({
  pending: requests.filter((request) => request.status === 'pending'),
  overdue: requests.filter((request) => request.status === 'expired'),
  submitted: requests.filter((request) => request.status === 'submitted'),
})

export type SubmitIssue = 'recommendation_required' | 'answers_required' | 'answer_too_long'

export interface SubmitCheck {
  readonly ok: boolean
  readonly issues: readonly SubmitIssue[]
  /** Question ids whose answer is over the limit. */
  readonly tooLong: readonly string[]
}

/**
 * The stage type behind a form: the public page sends the questions, not the type, and the domain rules
 * (`checkAnswers`) are keyed by the type. The questions come from the type's template, so their ids identify it.
 */
const stageTypeOf = (questionIds: readonly string[]): StageType | undefined => {
  const key = [...questionIds].sort().join('|')
  return STAGE_TYPES.find((type) => FEEDBACK_TEMPLATES[type].map((question) => question.id).sort().join('|') === key)
}

/** Whether the form can be sent: a recommendation, the required questions answered (domain rule), no answer over the limit. */
export const checkSubmission = (questionIds: readonly string[], answers: Readonly<Record<string, string>>, recommendation: FeedbackRecommendation | null): SubmitCheck => {
  const tooLong = Object.entries(answers).filter(([, value]) => value.trim().length > FEEDBACK_ANSWER_MAX).map(([id]) => id)
  const type = stageTypeOf(questionIds)
  // A form whose questions match no template is the fallback one (stage removed): it has no stage type.
  const rules = checkAnswers(type ?? null, answers)
  const issues: SubmitIssue[] = [
    ...(recommendation === null ? (['recommendation_required'] as const) : []),
    ...(rules.issues.some((issue) => issue.message === 'required') ? (['answers_required'] as const) : []),
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
