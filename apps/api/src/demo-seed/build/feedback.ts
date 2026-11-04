import { checkAnswers, criteriaForStage, FEEDBACK_REMINDER_DAYS, FEEDBACK_TEMPLATES, FEEDBACK_TOKEN_TTL_DAYS, type FeedbackRecommendation, type Observation } from '@candydati/domain';
import { EVIDENCE, feedbackAnswers } from '../content/texts.js';
import type { DemoContext, DemoRows } from '../dataset.js';
import { demoId } from '../ids.js';
import { daysAfter } from '../time.js';
import { declaredStage, type Applicant } from './applicants.js';
import { leftAt, shortlyAfter, shortlyBefore, type Timeline } from './timeline.js';

type Criterion = DemoRows['criteria'][number];
type Interviewer = DemoRows['interviewers'][number];
type FeedbackRows = Pick<DemoRows, 'feedbackRequests' | 'feedbacks' | 'criteria'>;

/** The interviewer's opinion follows what the team did next: an opinion for whoever decides, never a score. */
const recommendationOf = (timeline: Timeline, position: number): FeedbackRecommendation => {
  if (timeline.entries[position + 1] !== undefined || timeline.outcome === 'hired') return 'proceed';
  return timeline.outcome === 'not_selected' ? 'do_not_proceed' : 'discuss';
};

const observationOf = (recommendation: FeedbackRecommendation, slot: number): Observation => {
  if (recommendation === 'do_not_proceed') return slot % 2 === 0 ? 'not_observed' : 'to_explore';
  return slot % 3 === 2 ? 'to_explore' : 'observed';
};

const asCriterion = (row: Criterion) => ({
  id: row.id,
  organizationId: row.organizationId,
  jobId: row.jobId,
  stageId: row.stageId ?? null,
  label: row.label,
  position: row.position,
  createdBy: row.createdBy,
  createdAt: row.createdAt ?? new Date(0),
  firstUsedAt: null,
  retiredAt: null,
});

interface Ask {
  readonly applicant: Applicant;
  readonly position: number;
  readonly interviewer: Interviewer;
}

const requestAndFeedback = (ctx: DemoContext, ask: Ask, criteria: readonly Criterion[]) => {
  const { applicant, position, interviewer } = ask;
  const { timeline } = applicant;
  const entry = timeline.entries[position] as Timeline['entries'][number];
  const left = leftAt(timeline, position);
  const key = (suffix: string): string => demoId(ctx.organizationId, `application:${applicant.applicationId}:${suffix}:${entry.stageId}`);
  const requestedAt = shortlyAfter(entry.at, 0.05);
  const request = {
    id: key('feedback-request'),
    organizationId: ctx.organizationId,
    applicationId: applicant.applicationId,
    jobId: applicant.jobId,
    stageId: entry.stageId,
    interviewerKind: interviewer.kind,
    interviewerUserId: interviewer.userId ?? null,
    interviewerEmail: interviewer.email ?? ctx.owner.email,
    interviewerName: interviewer.name,
    tokenHash: ctx.secret(),
    expiresAt: daysAfter(requestedAt, FEEDBACK_TOKEN_TTL_DAYS),
    // Counted as all sent: the worker never emails a demo interviewer (an owner's inbox, or a reserved address).
    remindersSent: FEEDBACK_REMINDER_DAYS.length,
    requestedBy: ctx.owner.id,
    createdAt: requestedAt,
    submittedAt: left === null ? null : shortlyBefore(left),
  };
  if (left === null) return { request, feedback: null };
  const stageType = declaredStage(applicant.spec, entry.stageId)?.type ?? 'technical_interview';
  const checked = checkAnswers(stageType, feedbackAnswers(stageType, FEEDBACK_TEMPLATES[stageType].map((question) => question.id), applicant.index));
  if (checked.issues.length > 0) throw new Error(`Demo feedback for ${stageType} misses answers: ${checked.issues.map((issue) => issue.path).join(', ')}`);
  const recommendation = recommendationOf(timeline, position);
  const asked = criteriaForStage(criteria.filter((row) => row.jobId === applicant.jobId).map(asCriterion), entry.stageId);
  const observations = asked.map((criterion, slot) => {
    const observation = observationOf(recommendation, applicant.index + slot);
    return { criterionId: criterion.id, label: criterion.label, observation, evidence: EVIDENCE[observation][slot % EVIDENCE[observation].length] as string };
  });
  const feedback = {
    id: key('feedback'),
    organizationId: ctx.organizationId,
    applicationId: applicant.applicationId,
    requestId: request.id,
    stageId: entry.stageId,
    interviewerName: interviewer.name,
    answers: checked.answers,
    recommendation,
    observations,
    submittedAt: request.submittedAt as Date,
  };
  return { request, feedback };
};

/** A criterion is fixed by the first feedback that uses it (`first_used_at`), as the product does. */
const withFirstUse = (criteria: readonly Criterion[], feedbacks: DemoRows['feedbacks']): readonly Criterion[] =>
  criteria.map((criterion) => {
    const uses = feedbacks.filter((feedback) => (feedback.observations ?? []).some((observation) => observation.criterionId === criterion.id));
    const first = uses.map((feedback) => feedback.submittedAt.getTime()).sort((a, b) => a - b)[0];
    return first === undefined ? criterion : { ...criterion, firstUsedAt: new Date(first) };
  });

/**
 * Feedback requests for every stage with interviewers an application entered: submitted (answers, recommendation,
 * observations in words) once it moved on or was decided, still pending at its current stage.
 */
export function buildFeedback(ctx: DemoContext, applicants: readonly Applicant[], interviewers: DemoRows['interviewers'], criteria: DemoRows['criteria']): FeedbackRows {
  const asks: Ask[] = applicants.flatMap((applicant) =>
    applicant.timeline.entries.flatMap((entry, position) =>
      interviewers.filter((interviewer) => interviewer.jobId === applicant.jobId && interviewer.stageId === entry.stageId).slice(0, 1).map((interviewer) => ({ applicant, position, interviewer })),
    ),
  );
  const built = asks.map((ask) => requestAndFeedback(ctx, ask, criteria));
  const feedbacks = built.flatMap((item) => (item.feedback === null ? [] : [item.feedback]));
  return { feedbackRequests: built.map((item) => item.request), feedbacks, criteria: withFirstUse(criteria, feedbacks) };
}
