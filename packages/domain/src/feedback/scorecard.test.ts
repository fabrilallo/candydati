import { describe, expect, it } from 'vitest';
import { feedbackSubmissionSchema } from './feedback.js';
import {
  checkObservations,
  criteriaForStage,
  OBSERVATIONS,
  scorecardCriteriaInputSchema,
  scorecardSuggestionsSchema,
  type ScorecardCriterion,
} from './scorecard.js';

const AT = new Date('2026-05-01T00:00:00Z');
const criterion = (overrides: Partial<ScorecardCriterion>): ScorecardCriterion => ({
  id: 'c1', organizationId: 'org', jobId: 'job', stageId: null, label: 'Postgres experience', position: 0, createdBy: 'u', createdAt: AT, firstUsedAt: null, retiredAt: null, ...overrides,
});

describe('scorecard', () => {
  it('records what was seen in three words, never a number', () => {
    expect(OBSERVATIONS).toEqual(['observed', 'not_observed', 'to_explore']);
    expect(OBSERVATIONS.some((value) => /\d/.test(value))).toBe(false);
  });

  it('applies to a stage the criteria of every stage plus its own, active only, in order', () => {
    const list = [
      criterion({ id: 'c3', stageId: 'stage-1', position: 2, label: 'English B2' }),
      criterion({ id: 'c1', position: 0 }),
      criterion({ id: 'c2', stageId: 'stage-0', position: 1, label: 'Client communication' }),
      criterion({ id: 'c4', position: 3, retiredAt: AT, label: 'Old' }),
    ];
    expect(criteriaForStage(list, 'stage-1').map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(criteriaForStage(list, 'stage-0').map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('wants one observation with evidence for each criterion of the stage, and nothing else', () => {
    const applicable = [criterion({ id: 'c1' }), criterion({ id: 'c2', label: 'English B2' })];
    const ok = checkObservations(applicable, [
      { criterionId: 'c2', observation: 'to_explore', evidence: '  Only short answers in English  ' },
      { criterionId: 'c1', observation: 'observed', evidence: 'Explained index choices on a real schema' },
    ]);
    expect(ok.issues).toEqual([]);
    expect(ok.observations).toEqual([
      { criterionId: 'c1', label: 'Postgres experience', observation: 'observed', evidence: 'Explained index choices on a real schema' },
      { criterionId: 'c2', label: 'English B2', observation: 'to_explore', evidence: 'Only short answers in English' },
    ]);
    const bad = checkObservations(applicable, [
      { criterionId: 'c1', observation: 'observed', evidence: 'x' },
      { criterionId: 'c1', observation: 'observed', evidence: 'again' },
      { criterionId: 'zz', observation: 'observed', evidence: 'x' },
    ]);
    expect(bad.issues.map((issue) => issue.message).toSorted()).toEqual(['duplicate_criterion', 'required', 'unknown_criterion']);
  });

  it('refuses blank or oversized evidence, and any score through the submission', () => {
    const schema = feedbackSubmissionSchema;
    const base = { answers: {}, recommendation: 'discuss' };
    expect(schema.safeParse({ ...base, observations: [{ criterionId: 'c1', observation: 'observed', evidence: '   ' }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, observations: [{ criterionId: 'c1', observation: 'observed', evidence: 'x'.repeat(1001) }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, observations: [{ criterionId: 'c1', observation: 'observed', evidence: 'ok', score: 4 }] }).success).toBe(false);
    expect(schema.safeParse({ ...base, observations: [{ criterionId: 'c1', observation: 4, evidence: 'ok' }] }).success).toBe(false);
    expect(schema.parse(base).observations).toEqual([]);
  });

  it('accepts at most twenty short criteria, trimmed', () => {
    expect(scorecardCriteriaInputSchema.parse([{ label: '  English B2 ' }])).toEqual([{ label: 'English B2', stageId: null }]);
    expect(scorecardCriteriaInputSchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ label: `C${i}` }))).success).toBe(false);
    expect(scorecardCriteriaInputSchema.safeParse([{ label: 'x'.repeat(121) }]).success).toBe(false);
    expect(scorecardCriteriaInputSchema.safeParse([{ label: 'ok', weight: 3 }]).success).toBe(false);
  });

  it('reads a model draft as data: labels only, bounded', () => {
    expect(scorecardSuggestionsSchema.safeParse({ criteria: [{ label: 'Postgres experience', stageId: null }] }).success).toBe(false);
    expect(scorecardSuggestionsSchema.parse({ criteria: ['Postgres experience', 'Client communication', 'English B2'] }).criteria).toHaveLength(3);
  });
});
