import {
  feedbackQuestionsFor,
  localizeQuestions,
  type FeedbackRecommendation,
  type InterviewFeedback,
  type Job,
} from '@tt/domain';
import { z } from 'zod';
import { requireApplication } from '../candidates/shared.js';
import { requireJob } from '../jobs/shared.js';
import { defineFeedbackUseCase } from './define.js';
import { stageContextOf, toRequestView, type FeedbackRequestView } from './shared.js';
import { sequential } from '../../sequential.js';

export interface FeedbackAnswerView {
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
}

export interface FeedbackView {
  readonly id: string;
  readonly requestId: string;
  readonly stageId: string;
  readonly stageLabel: string;
  readonly interviewerName: string;
  readonly answers: readonly FeedbackAnswerView[];
  readonly recommendation: FeedbackRecommendation;
  readonly submittedAt: Date;
}

export interface ApplicationFeedbackView {
  readonly requests: readonly FeedbackRequestView[];
  readonly feedback: readonly FeedbackView[];
}

function toFeedbackView(feedback: InterviewFeedback, job: Job): FeedbackView {
  const stage = stageContextOf(job, feedback.stageId);
  const questions = localizeQuestions(feedbackQuestionsFor(stage.declared?.type ?? null), job.content.language);
  return {
    id: feedback.id,
    requestId: feedback.requestId,
    stageId: feedback.stageId,
    stageLabel: stage.label,
    interviewerName: feedback.interviewerName,
    answers: questions.flatMap((question) => {
      const answer = feedback.answers[question.id];
      return answer === undefined ? [] : [{ questionId: question.id, question: question.label, answer }];
    }),
    recommendation: feedback.recommendation,
    submittedAt: feedback.submittedAt,
  };
}

/** The "Feedback" tab of the candidate detail: who was asked, who answered and what they wrote. */
export const listApplicationFeedback = defineFeedbackUseCase({
  name: 'listApplicationFeedback',
  input: z.object({ applicationId: z.string().min(1) }),
  permission: 'feedback:read',
  audit: { skip: 'shown inside the candidate detail, whose opening is audited as candidate.viewed' },
  handler: async ({ deps, actor, input }): Promise<ApplicationFeedbackView> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    const job = await requireJob(deps, actor.organizationId, application.jobId);
    const [requests, feedback] = await sequential(
      () => deps.feedbackRequests.listByApplication(actor.organizationId, application.id),
      () => deps.interviewFeedback.listByApplication(actor.organizationId, application.id),
    );
    const now = deps.now();
    return {
      requests: requests.map((request) => toRequestView(request, job, now)),
      feedback: feedback.map((item) => toFeedbackView(item, job)),
    };
  },
});
