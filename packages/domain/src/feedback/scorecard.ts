import { z } from 'zod';

/**
 * Scorecards without scores (PRODUCT.md §2.4, §3.1). A job declares, before the interviews, what the interviewers look
 * for (a criterion: "Postgres experience", "English B2"), for every stage or for one. For each criterion the interviewer
 * says what they saw in one of three words and writes the evidence. There is no number, no weight, no total and no
 * order of candidates anywhere: a person reads the evidence side by side and decides.
 */
export const OBSERVATIONS = ['observed', 'not_observed', 'to_explore'] as const;
export type Observation = (typeof OBSERVATIONS)[number];

export const SCORECARD_CRITERIA_MAX = 20;
export const CRITERION_LABEL_MAX = 120;
export const EVIDENCE_MAX = 1000;
export const SUGGESTED_CRITERIA_MAX = 8;

/**
 * A criterion of a job. Editable until the first feedback that uses it (`firstUsedAt`); afterwards it is append-only:
 * it can only be retired (`retiredAt`), and a new wording is a new criterion. Feedback keeps the label it was written
 * against, so past feedback reads the same forever.
 */
export interface ScorecardCriterion {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  /** Null: asked at every declared stage of the job. */
  readonly stageId: string | null;
  readonly label: string;
  readonly position: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly firstUsedAt: Date | null;
  readonly retiredAt: Date | null;
}

/** What an interviewer recorded for one criterion, with the label as it read when they wrote. */
export interface CriterionObservation {
  readonly criterionId: string;
  readonly label: string;
  readonly observation: Observation;
  readonly evidence: string;
}

const label = z.string().trim().min(1).max(CRITERION_LABEL_MAX);

/** An observation as stored with the feedback (jsonb is a boundary: read through this). */
export const criterionObservationSchema = z.object({
  criterionId: z.string().min(1),
  label: z.string().min(1).max(CRITERION_LABEL_MAX),
  observation: z.enum(OBSERVATIONS),
  evidence: z.string().min(1).max(EVIDENCE_MAX),
});
export const storedObservationsSchema = z.array(criterionObservationSchema).max(SCORECARD_CRITERIA_MAX);

/** One criterion as the editor sends it. `id` names an existing criterion; without it, a new one. Strict: no weight. */
export const scorecardCriterionInputSchema = z.strictObject({
  id: z.string().min(1).max(100).optional(),
  label,
  stageId: z.string().min(1).max(100).nullable().default(null),
});
export type ScorecardCriterionInput = z.infer<typeof scorecardCriterionInputSchema>;

/** The whole scorecard, in order: the list replaces the active criteria of the job. */
export const scorecardCriteriaInputSchema = z.array(scorecardCriterionInputSchema).max(SCORECARD_CRITERIA_MAX);

/** One observation as the interviewer sends it. Strict: any `score` or `rating` is refused. */
export const observationInputSchema = z.strictObject({
  criterionId: z.string().min(1).max(100),
  observation: z.enum(OBSERVATIONS),
  evidence: z.string().trim().min(1).max(EVIDENCE_MAX),
});
export type ObservationInput = z.infer<typeof observationInputSchema>;

export const observationsInputSchema = z.array(observationInputSchema).max(SCORECARD_CRITERIA_MAX);

/** The model's draft (`suggestScorecardCriteria`): labels only, read as data. */
export const scorecardSuggestionsSchema = z.object({
  criteria: z.array(label).min(1).max(SUGGESTED_CRITERIA_MAX),
});

/** The active criteria asked at `stageId`: those of every stage and those of that stage, in the scorecard's order. */
export const criteriaForStage = (criteria: readonly ScorecardCriterion[], stageId: string): readonly ScorecardCriterion[] =>
  criteria
    .filter((criterion) => criterion.retiredAt === null && (criterion.stageId === null || criterion.stageId === stageId))
    .toSorted((a, b) => a.position - b.position);

export interface ObservationIssue {
  readonly path: string;
  readonly message: 'required' | 'unknown_criterion' | 'duplicate_criterion';
}

/** Every applicable criterion answered exactly once, nothing else. Returns the observations in the scorecard's order. */
export function checkObservations(
  applicable: readonly ScorecardCriterion[],
  given: readonly ObservationInput[],
): { readonly observations: readonly CriterionObservation[]; readonly issues: readonly ObservationIssue[] } {
  const known = new Set(applicable.map((criterion) => criterion.id));
  const seen = new Set<string>();
  const issues: ObservationIssue[] = [];
  given.forEach((item, index) => {
    if (!known.has(item.criterionId)) issues.push({ path: `observations.${index}.criterionId`, message: 'unknown_criterion' });
    else if (seen.has(item.criterionId)) issues.push({ path: `observations.${index}.criterionId`, message: 'duplicate_criterion' });
    seen.add(item.criterionId);
  });
  const observations = applicable.flatMap((criterion): CriterionObservation[] => {
    const found = given.find((item) => item.criterionId === criterion.id);
    if (!found) {
      issues.push({ path: `observations.${criterion.id}`, message: 'required' });
      return [];
    }
    return [{ criterionId: criterion.id, label: criterion.label, observation: found.observation, evidence: found.evidence.trim() }];
  });
  return { observations, issues };
}
