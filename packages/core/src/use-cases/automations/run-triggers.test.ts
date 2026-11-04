import { DAY_MS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { buildApplication, buildAutomationRule, buildCandidate, seedAutomationWorld, systemActor, ORG_A, type AutomationSeedOptions } from '../../testing/index.js';
import { runAutomations } from './run-automations.js';

const worker = systemActor({ organizationId: ORG_A });
const NOW = new Date('2026-06-01T10:00:00.000Z');
const input = (overrides = {}) => ({ organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0', ...overrides });
const world = (options: AutomationSeedOptions = {}) =>
  seedAutomationWorld({
    candidates: [buildCandidate({ organizationId: ORG_A, tags: ['senior'] })],
    applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0', stageChangedAt: new Date(NOW.getTime() - 2 * DAY_MS) })],
    ...options,
  });
const ruleOn = (id: string, trigger: object, overrides = {}) => buildAutomationRule({ id, trigger: trigger as never, action: { type: 'create_task', title: id, assignee: 'job_owner' }, ...overrides });
const titles = (deps: ReturnType<typeof world>) => deps.tasks.snapshot().map((task) => task.title);

describe('runAutomations: triggers', () => {
  it('runs only the rules of the trigger that fired', async () => {
    const deps = world({ rules: [ruleOn('entry', { type: 'stage_entered' }), ruleOn('reply', { type: 'candidate_replied' }), ruleOn('feedback', { type: 'feedback_submitted' })] });
    expect(await runAutomations(deps, worker, input({ trigger: 'candidate_replied', occurrence: 'message:m1' }))).toEqual({ executed: 1, failed: 0, skipped: null });
    expect(titles(deps)).toEqual(['reply']);
    expect(deps.auditLog.events()[0]?.metadata).toMatchObject({ trigger: 'candidate_replied' });
  });

  it('fires once per occurrence: each reply is one, the same reply delivered twice is not', async () => {
    const deps = world({ rules: [ruleOn('reply', { type: 'candidate_replied' })] });
    await runAutomations(deps, worker, input({ trigger: 'candidate_replied', occurrence: 'message:m1' }));
    await runAutomations(deps, worker, input({ trigger: 'candidate_replied', occurrence: 'message:m1' }));
    await runAutomations(deps, worker, input({ trigger: 'candidate_replied', occurrence: 'message:m2' }));
    expect(titles(deps)).toEqual(['reply', 'reply']);
  });

  it('feedback belongs to the stage it was asked for, even after the candidate moved on', async () => {
    const deps = world({ rules: [ruleOn('feedback', { type: 'feedback_submitted' }), ruleOn('reply', { type: 'candidate_replied' })] });
    expect(await runAutomations(deps, worker, input({ stageId: 'received', trigger: 'candidate_replied', occurrence: 'message:m1' }))).toMatchObject({ skipped: 'stage_changed' });
    const feedback = ruleOn('feedback-received', { type: 'feedback_submitted' }, { stageId: 'received' });
    const moved = world({ rules: [feedback] });
    expect(await runAutomations(moved, worker, input({ stageId: 'received', trigger: 'feedback_submitted', occurrence: 'feedback:f1' }))).toMatchObject({ executed: 1 });
  });

  it('a time-based run checks its rule again: not stuck long enough yet means nothing, and nothing is claimed', async () => {
    const deps = world({ rules: [ruleOn('stuck3', { type: 'stage_stuck', days: 3 }), ruleOn('stuck1', { type: 'stage_stuck', days: 1 })] });
    expect(await runAutomations(deps, worker, input({ trigger: 'stage_stuck', ruleId: 'stuck3' }))).toEqual({ executed: 0, failed: 0, skipped: null });
    expect(deps.executions.snapshot()).toEqual([]);
    expect(await runAutomations(deps, worker, input({ trigger: 'stage_stuck', ruleId: 'stuck1' }))).toMatchObject({ executed: 1 });
    expect(deps.executions.snapshot()[0]).toMatchObject({ ruleId: 'stuck1', occurrence: 'stuck' });
    expect(await runAutomations(deps, worker, input({ trigger: 'stage_stuck', ruleId: 'stuck1' }))).toMatchObject({ executed: 0 });
  });

  it('with a rule id, runs nothing when that rule was paused, changed or is of another stage', async () => {
    const deps = world({ rules: [ruleOn('paused', { type: 'stage_stuck', days: 1 }, { enabled: false }), ruleOn('other', { type: 'stage_stuck', days: 1 }, { stageId: 'stage-1' })] });
    for (const ruleId of ['paused', 'other', 'missing']) {
      expect(await runAutomations(deps, worker, input({ trigger: 'stage_stuck', ruleId }))).toMatchObject({ executed: 0, failed: 0 });
    }
    expect(deps.tasks.snapshot()).toEqual([]);
  });
});

describe('runAutomations: conditions', () => {
  it('acts only for applications that meet every condition of the rule', async () => {
    const deps = world({
      rules: [
        ruleOn('senior', { type: 'stage_entered' }, { conditions: { tags: ['senior'], sources: ['careers_page'] } }),
        ruleOn('junior', { type: 'stage_entered' }, { conditions: { tags: ['junior'] } }),
        ruleOn('pool', { type: 'stage_entered' }, { conditions: { consentScopes: ['talent_pool'] } }),
        ruleOn('manual', { type: 'stage_entered' }, { conditions: { sources: ['manual'] } }),
      ],
    });
    expect(await runAutomations(deps, worker, input())).toEqual({ executed: 1, failed: 0, skipped: null });
    expect(titles(deps)).toEqual(['senior']);
    // A rule that did not apply claimed nothing.
    expect(deps.executions.snapshot().map((run) => run.ruleId)).toEqual(['senior']);
  });
});
