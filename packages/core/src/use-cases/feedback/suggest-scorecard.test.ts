import { describe, expect, it } from 'vitest';
import { ORG_A, seedHrWorld, userActor } from '../../testing/index.js';
import { setJobScorecard } from './scorecard.js';
import { suggestScorecardCriteria, type CriteriaContext } from './suggest-scorecard.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });

const build = (answer: unknown, available = true) => {
  const calls: CriteriaContext[] = [];
  const errors: unknown[] = [];
  const world = seedHrWorld();
  const deps = {
    ...world,
    criteriaDrafter: {
      available: () => available,
      draft: async (context: CriteriaContext) => {
        calls.push(context);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
    onSuggestError: (error: unknown) => errors.push(error),
  };
  return { deps, calls, errors };
};

describe('suggestScorecardCriteria', () => {
  it('drafts labels from the ad only, drops the ones already declared, saves nothing and audits counts', async () => {
    const { deps, calls } = build({ criteria: ['Postgres experience', 'English B2', 'Client communication'] });
    await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ label: 'english b2' }] });
    const result = await suggestScorecardCriteria(deps, recruiter, { jobId: 'job_1' });
    expect(result).toEqual({ status: 'proposed', criteria: ['Postgres experience', 'Client communication'] });
    expect(calls[0]).toMatchObject({ existing: ['english b2'] });
    expect(Object.keys(calls[0]!).toSorted()).toEqual(['existing', 'language', 'preferred', 'requirements', 'responsibilities', 'stages', 'title']);
    expect(deps.feedbackStore.read().criteria).toHaveLength(1);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'job.scorecard_suggested', target: { type: 'job', id: 'job_1' }, metadata: { status: 'proposed', count: 2 } });
  });

  it('answers unavailable without a model and failed on a bad answer or an error', async () => {
    expect(await suggestScorecardCriteria(build({}, false).deps, recruiter, { jobId: 'job_1' })).toEqual({ status: 'unavailable' });
    const bad = build({ criteria: [{ label: 'x', score: 5 }] });
    expect(await suggestScorecardCriteria(bad.deps, recruiter, { jobId: 'job_1' })).toEqual({ status: 'failed' });
    expect(bad.errors).toHaveLength(1);
    expect(await suggestScorecardCriteria(build(new Error('down')).deps, recruiter, { jobId: 'job_1' })).toEqual({ status: 'failed' });
  });
});
