import { DAY_MS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { buildApplication, buildAutomationRule, buildCandidate, seedAutomationWorld, systemActor, ORG_A } from '../../testing/index.js';
import { runAutomations } from './run-automations.js';
import { scanTimedAutomations } from './scan-timed.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const app = (id: string, overrides = {}) => buildApplication({ id, candidateId: `cand_${id}`, organizationId: ORG_A, stageId: 'stage-0', stageChangedAt: daysAgo(1), ...overrides });
const stuck = buildAutomationRule({ id: 'rule_stuck', trigger: { type: 'stage_stuck', days: 5 }, conditions: { tags: ['senior'] } });
const dueSoon = buildAutomationRule({ id: 'rule_due', stageId: 'stage-1', trigger: { type: 'response_due_soon', daysBefore: 2 } });

const world = () =>
  seedAutomationWorld({
    rules: [stuck, dueSoon, buildAutomationRule({ id: 'rule_entry' }), buildAutomationRule({ id: 'rule_off', trigger: { type: 'stage_stuck', days: 1 }, enabled: false })],
    candidates: [buildCandidate({ id: 'cand_a', organizationId: ORG_A, tags: ['senior'] }), buildCandidate({ id: 'cand_b', organizationId: ORG_A, email: 'b@example.com' })],
    applications: [
      app('a', { stageChangedAt: daysAgo(6) }),
      app('b', { candidateId: 'cand_b', stageChangedAt: daysAgo(9) }),
      app('c', { candidateId: 'cand_a', stageId: 'stage-1', stageChangedAt: daysAgo(4), responseDueAt: new Date(NOW.getTime() + DAY_MS) }),
      app('d', { candidateId: 'cand_a', stageChangedAt: daysAgo(9), outcome: 'withdrawn' }),
    ],
  });

describe('scanTimedAutomations', () => {
  it('queues one automation.run per due rule and application, with the rule and the occurrence', async () => {
    const deps = world();
    expect(await scanTimedAutomations(deps, { now: NOW })).toEqual({ rules: 2, queued: 2, failed: 0 });
    expect(deps.queue.jobs()).toEqual([
      { name: 'automation.run', payload: { organizationId: ORG_A, applicationId: 'a', stageId: 'stage-0', trigger: 'stage_stuck', occurrence: 'stuck', ruleId: 'rule_stuck' } },
      {
        name: 'automation.run',
        payload: { organizationId: ORG_A, applicationId: 'c', stageId: 'stage-1', trigger: 'response_due_soon', occurrence: `due:${new Date(NOW.getTime() + DAY_MS).toISOString()}`, ruleId: 'rule_due' },
      },
    ]);
  });

  it('is idempotent: once the run is recorded, the next scan queues nothing for it', async () => {
    const deps = world();
    await scanTimedAutomations(deps, { now: NOW });
    const worker = systemActor({ organizationId: ORG_A });
    for (const job of deps.queue.jobs()) await runAutomations(deps, worker, job.payload);
    expect(deps.tasks.snapshot().map((task) => task.applicationId).toSorted()).toEqual(['a', 'c']);
    const before = deps.queue.jobs().length;
    expect(await scanTimedAutomations(deps, { now: new Date(NOW.getTime() + 3_600_000) })).toMatchObject({ queued: 0 });
    expect(deps.queue.jobs()).toHaveLength(before);
    // Running a stale task again does nothing either.
    for (const job of deps.queue.jobs()) await runAutomations(deps, worker, job.payload);
    expect(deps.tasks.snapshot()).toHaveLength(2);
  });

  it('counts a task that could not be queued and goes on with the others', async () => {
    const deps = world();
    let calls = 0;
    const queue = {
      async enqueue(...args: Parameters<typeof deps.queue.enqueue>) {
        calls += 1;
        if (calls === 1) throw new Error('queue down');
        return deps.queue.enqueue(...args);
      },
    };
    expect(await scanTimedAutomations({ ...deps, queue }, { now: NOW })).toEqual({ rules: 2, queued: 1, failed: 1 });
  });
});
