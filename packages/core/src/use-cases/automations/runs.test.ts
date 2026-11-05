import { DAY_MS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { apiKeyActor, buildApplication, buildAutomationRule, buildCandidate, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { listAutomationRuns } from './runs.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const run = (id: string, applicationId: string, occurrence: string, createdAt: Date, ruleId = 'rule_1') => ({
  id,
  organizationId: ORG_A,
  ruleId,
  applicationId,
  stageId: 'stage-0',
  stageEnteredAt: daysAgo(10),
  occurrence,
  createdAt,
});

const world = async () => {
  const deps = seedAutomationWorld({
    rules: [buildAutomationRule({ id: 'rule_1' }), buildAutomationRule({ id: 'rule_2' })],
    candidates: [buildCandidate({ id: 'cand_a', organizationId: ORG_A, firstName: 'Anna', lastName: 'Rossi' })],
    applications: [buildApplication({ id: 'a', candidateId: 'cand_a', organizationId: ORG_A, stageId: 'stage-0' })],
  });
  await deps.executions.claim(run('x1', 'a', '', daysAgo(3)));
  await deps.executions.claim(run('x2', 'a', 'message:m1', daysAgo(1)));
  await deps.executions.claim(run('x3', 'a', 'stuck', daysAgo(2), 'rule_2'));
  return deps;
};

describe('listAutomationRuns', () => {
  it('lists the runs of the rule, newest first, with the trigger kind and the candidate', async () => {
    const runs = await listAutomationRuns(await world(), recruiter, { ruleId: 'rule_1' });
    const anna = { id: 'cand_a', firstName: 'Anna', lastName: 'Rossi' };
    expect(runs).toEqual([
      { id: 'x2', at: daysAgo(1).toISOString(), trigger: 'candidate_replied', applicationId: 'a', candidate: anna },
      { id: 'x1', at: daysAgo(3).toISOString(), trigger: 'stage_entered', applicationId: 'a', candidate: anna },
    ]);
  });

  it('honours the limit', async () => {
    expect(await listAutomationRuns(await world(), recruiter, { ruleId: 'rule_1', limit: 1 })).toHaveLength(1);
  });

  it('hides names without candidate:read', async () => {
    const runs = await listAutomationRuns(await world(), apiKeyActor({ organizationId: ORG_A, scopes: ['automation:manage'] }), { ruleId: 'rule_1' });
    expect(runs.map((r) => r.candidate)).toEqual([null, null]);
  });

  it('needs automation:manage and a rule of the organization', async () => {
    await expect(listAutomationRuns(await world(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), { ruleId: 'rule_1' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAutomationRuns(await world(), userActor({ role: 'owner', organizationId: ORG_B }), { ruleId: 'rule_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(listAutomationRuns(await world(), recruiter, { ruleId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
