import type { Observation, ScorecardCriterion } from '@candydati/domain';

/** One interviewer's entry on a criterion. */
export interface ScorecardEntryView {
  readonly feedbackId: string;
  readonly interviewerName: string;
  readonly stageId: string;
  readonly stageLabel: string;
  readonly observation: Observation;
  readonly evidence: string;
  readonly submittedAt: Date;
}

/** A criterion with what every interviewer recorded on it, in the order they wrote. */
export interface ScorecardRowView {
  readonly criterionId: string;
  readonly label: string;
  readonly entries: readonly ScorecardEntryView[];
}

interface FeedbackLike {
  readonly id: string;
  readonly interviewerName: string;
  readonly stageId: string;
  readonly stageLabel: string;
  readonly submittedAt: Date;
  readonly observations: readonly { readonly criterionId: string; readonly label: string; readonly observation: Observation; readonly evidence: string }[];
}

const entriesOf = (feedback: readonly FeedbackLike[], criterionId: string): readonly ScorecardEntryView[] =>
  feedback.flatMap((item) =>
    item.observations
      .filter((o) => o.criterionId === criterionId)
      .map((o) => ({
        feedbackId: item.id,
        interviewerName: item.interviewerName,
        stageId: item.stageId,
        stageLabel: item.stageLabel,
        observation: o.observation,
        evidence: o.evidence,
        submittedAt: item.submittedAt,
      })),
  );

/**
 * The criteria (rows) with the evidence of each interviewer side by side (PRODUCT.md §3.1). Rows follow the scorecard's
 * order: the active criteria, then retired ones that feedback used. A row shows the label the feedback was written
 * against. Nothing is counted, totalled or ranked: the view holds words only, and a person reads them.
 */
export function scorecardMatrix(feedback: readonly FeedbackLike[], criteria: readonly ScorecardCriterion[]): readonly ScorecardRowView[] {
  const used = new Set(feedback.flatMap((item) => item.observations.map((o) => o.criterionId)));
  const byPosition = (a: ScorecardCriterion, b: ScorecardCriterion) => a.position - b.position;
  const ordered = [
    ...criteria.filter((c) => c.retiredAt === null).toSorted(byPosition),
    ...criteria.filter((c) => c.retiredAt !== null && used.has(c.id)).toSorted(byPosition),
  ];
  const known = new Set(ordered.map((c) => c.id));
  const ids = [...ordered.map((c) => c.id), ...[...used].filter((id) => !known.has(id))];
  const written = feedback.flatMap((item) => item.observations);
  const labelOf = (id: string): string => written.find((o) => o.criterionId === id)?.label ?? ordered.find((c) => c.id === id)?.label ?? '';
  return ids.map((criterionId) => ({ criterionId, label: labelOf(criterionId), entries: entriesOf(feedback, criterionId) }));
}
