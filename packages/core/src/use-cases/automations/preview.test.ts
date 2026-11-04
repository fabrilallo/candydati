import { DAY_MS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { apiKeyActor, buildApplication, buildAutomationRule, buildCandidate, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { previewAutomation } from './preview.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const app = (id: string, overrides = {}) =>
  buildApplication({ id, candidateId: `cand_${id}`, organizationId: ORG_A, stageId: 'stage-0', stageChangedAt: daysAgo(1), createdAt: daysAgo(30), ...overrides });
const person = (id: string, firstName: string, overrides = {}) => buildCandidate({ id: `cand_${id}`, organizationId: ORG_A, firstName, lastName: 'Rossi', email: `${id}@example.com`, ...overrides });

const world = (rules = [] as ReturnType<typeof buildAutomationRule>[]) =>
  seedAutomationWorld({
    rules,
    candidates: [person('a', 'Anna', { tags: ['senior'] }), person('b', 'Bruno'), person('c', 'Carla', { tags: ['senior'] }), person('d', 'Dario')],
    applications: [
      app('a', { stageChangedAt: daysAgo(6), createdAt: daysAgo(20) }),
      app('b', { stageChangedAt: daysAgo(8), source: 'manual', createdAt: daysAgo(40) }),
      app('c', { stageChangedAt: daysAgo(2) }),
      app('d', { stageChangedAt: daysAgo(9), outcome: 'not_selected' }),
      app('e', { stageId: 'stage-1', candidateId: 'cand_a' }),
    ],
  });

describe('previewAutomation', () => {
  it('lists the open applications of the stage that meet the conditions, by date of application', async () => {
    const deps = world();
    const preview = await previewAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', conditions: { tags: ['senior'] } });
    expect(preview).toEqual({
      trigger: 'stage_entered',
      matching: 2,
      firingNow: null,
      items: [
        { applicationId: 'c', candidateId: 'cand_c', firstName: 'Carla', lastName: 'Rossi', firesNow: null },
        { applicationId: 'a', candidateId: 'cand_a', firstName: 'Anna', lastName: 'Rossi', firesNow: null },
      ],
    });
  });

  it('time-based triggers: says who the rule would act for at the next scan', async () => {
    const deps = world();
    const preview = await previewAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', trigger: { type: 'stage_stuck', days: 5 } });
    expect(preview.matching).toBe(3);
    expect(preview.firingNow).toBe(2);
    expect(preview.items?.map((item) => [item.applicationId, item.firesNow])).toEqual([
      ['b', true],
      ['c', false],
      ['a', true],
    ]);
  });

  it('with the rule being edited, leaves out the applications it already acted for in this stage entry', async () => {
    const rule = buildAutomationRule({ id: 'rule_stuck', trigger: { type: 'stage_stuck', days: 3 } });
    const deps = world([rule]);
    await deps.executions.claim({ id: 'x1', organizationId: ORG_A, ruleId: 'rule_stuck', applicationId: 'b', stageId: 'stage-0', stageEnteredAt: daysAgo(8), occurrence: 'stuck', createdAt: NOW });
    const preview = await previewAutomation(deps, recruiter, { jobId: 'job_1', ruleId: 'rule_stuck', stageId: 'stage-0', trigger: { type: 'stage_stuck', days: 5 } });
    expect(preview.items?.filter((item) => item.firesNow).map((item) => item.applicationId)).toEqual(['a']);
    expect(preview.firingNow).toBe(1);
  });

  it('is read-only: no audit event, no run, no queued task', async () => {
    const deps = world();
    await previewAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', trigger: { type: 'stage_stuck', days: 1 } });
    expect(deps.auditLog.events()).toEqual([]);
    expect(deps.queue.jobs()).toEqual([]);
    expect(deps.tasks.snapshot()).toEqual([]);
  });

  it('gives counts only to a caller that may not read candidates', async () => {
    const key = apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'recruiter_1', role: 'recruiter', scopes: ['automation:manage'] });
    const preview = await previewAutomation(world(), key, { jobId: 'job_1', stageId: 'stage-0' });
    expect(preview).toMatchObject({ matching: 3, items: null });
  });

  it('needs automation:manage, a job of the organization, a stage of the job and a rule of the job', async () => {
    await expect(previewAutomation(world(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), { jobId: 'job_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewAutomation(world(), userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_1', stageId: 'stage-0' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(previewAutomation(world(), recruiter, { jobId: 'job_1', stageId: 'nope' })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAutomation(world(), recruiter, { jobId: 'job_1', stageId: 'stage-0', ruleId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
