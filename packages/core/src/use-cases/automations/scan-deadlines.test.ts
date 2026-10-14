import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, buildJob, buildTask, seedAutomationWorld, ORG_A, ORG_B, type AutomationSeedOptions } from '../../testing/index.js';
import { buildAutomationRule } from '../../testing/automation-fixtures.js';
import { markDigestsEmailed, scanDeadlines } from './scan-deadlines.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-06-01T10:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const world = (options: AutomationSeedOptions = {}) => seedAutomationWorld(options);
const kinds = (deps: ReturnType<typeof world>) => deps.notifications.snapshot().map((n) => [n.userId, n.kind]);

describe('scanDeadlines', () => {
  it('notifies the job owner once for an application due within 48h', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(10 * HOUR) })] });
    const result = await scanDeadlines(deps, { now: NOW });
    expect(kinds(deps)).toEqual([['user_test', 'response_due_soon']]);
    expect(deps.notifications.snapshot()[0]).toMatchObject({ applicationId: 'app_1', jobId: 'job_1', taskId: null, payload: { stageId: 'received', escalated: false } });
    expect(result.digests).toEqual([
      expect.objectContaining({ organizationId: ORG_A, userId: 'user_test', email: 'olivia@acme.example', name: 'Olivia Owner', jobTitles: { job_1: 'Backend Developer' } }),
    ]);
  });

  it('notifies about an overdue application, without escalation up to 2 days', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(-DAY) })] });
    await scanDeadlines(deps, { now: NOW });
    expect(kinds(deps)).toEqual([['user_test', 'response_overdue']]);
  });

  it('escalates to every owner and admin after more than 2 days overdue, and not to recruiters', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(-2 * DAY - HOUR) })] });
    const { digests } = await scanDeadlines(deps, { now: NOW });
    expect(kinds(deps).sort()).toEqual([['admin_1', 'response_overdue'], ['user_test', 'response_overdue']]);
    expect(deps.notifications.snapshot().find((n) => n.userId === 'admin_1')?.payload).toMatchObject({ escalated: true });
    expect(digests.map((d) => d.userId).sort()).toEqual(['admin_1', 'user_test']);
  });

  it('never repeats itself: a second run creates nothing and returns an empty digest', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })] });
    const first = await scanDeadlines(deps, { now: NOW });
    await markDigestsEmailed(deps.notifications, first.digests, NOW);
    const second = await scanDeadlines(deps, { now: at(HOUR) });
    expect(deps.notifications.snapshot()).toHaveLength(1);
    expect(second.digests).toEqual([]);
  });

  it('builds the digest from unsent notifications: a retry after a crash before the send still carries them', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })] });
    const crashed = await scanDeadlines(deps, { now: NOW });
    expect(crashed.digests).toHaveLength(1);
    // The worker died before sending: nothing was marked. The retry inserts nothing new, yet the digest is not lost.
    const retry = await scanDeadlines(deps, { now: at(HOUR / 2) });
    expect(deps.notifications.snapshot()).toHaveLength(1);
    expect(retry.digests).toEqual([expect.objectContaining({ userId: 'user_test', notifications: [expect.objectContaining({ kind: 'response_due_soon' })] })]);
    await markDigestsEmailed(deps.notifications, retry.digests, at(HOUR / 2));
    expect((await scanDeadlines(deps, { now: at(HOUR / 4 * 3) })).digests).toEqual([]);
  });

  it('drops notifications older than the digest window instead of emailing them days later', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })] });
    await scanDeadlines(deps, { now: NOW });
    expect((await scanDeadlines(deps, { now: at(10 * DAY) })).digests.every((d) => d.notifications.every((n) => n.kind !== 'response_due_soon'))).toBe(true);
  });

  it('alerts again when the application re-enters the same stage with a new response deadline', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'received', responseDueAt: at(HOUR) })] });
    await scanDeadlines(deps, { now: NOW });
    const [app] = deps.store.read().applications;
    // Moved away and back: same application, same stage, a new promise with a new deadline.
    deps.store.write({ applications: [{ ...app!, responseDueAt: at(5 * DAY + HOUR) }] });
    await scanDeadlines(deps, { now: at(5 * DAY) });
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'response_due_soon')).toHaveLength(2);
  });

  it('notifies again on the overdue state, and when escalation starts, but only the new ones', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })] });
    await scanDeadlines(deps, { now: NOW });
    await scanDeadlines(deps, { now: at(2 * HOUR) });
    expect(kinds(deps)).toEqual([['user_test', 'response_due_soon'], ['user_test', 'response_overdue']]);
    const third = await scanDeadlines(deps, { now: at(4 * DAY) });
    expect(third.digests.map((d) => d.userId)).toEqual(['admin_1']);
    expect(kinds(deps)).toHaveLength(3);
  });

  it('a new stage is a new promise: the same application notifies again for the new stage', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })] });
    await scanDeadlines(deps, { now: NOW });
    deps.store.write({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0', responseDueAt: at(2 * HOUR) })] });
    await scanDeadlines(deps, { now: NOW });
    expect(deps.notifications.snapshot()).toHaveLength(2);
  });

  it('ignores answered, decided, on-track and deadline-less applications', async () => {
    const candidates = ['1', '2', '3', '4'].map((n) => buildCandidate({ id: `cand_${n}`, organizationId: ORG_A, email: `c${n}@x.it` }));
    const deps = world({
      candidates,
      applications: [
        buildApplication({ id: 'a', candidateId: 'cand_1', organizationId: ORG_A, responseDueAt: at(-DAY), respondedAt: at(-HOUR) }),
        buildApplication({ id: 'b', candidateId: 'cand_2', organizationId: ORG_A, responseDueAt: at(-DAY), outcome: 'hired', closedAt: NOW }),
        buildApplication({ id: 'c', candidateId: 'cand_3', organizationId: ORG_A, responseDueAt: at(5 * DAY) }),
        buildApplication({ id: 'd', candidateId: 'cand_4', organizationId: ORG_A, responseDueAt: null }),
      ],
    });
    const result = await scanDeadlines(deps, { now: NOW });
    expect(deps.notifications.snapshot()).toHaveLength(0);
    expect(result.digests).toEqual([]);
  });

  it('falls back to owners and admins when the job owner left the organization', async () => {
    const deps = world({
      jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published', createdBy: 'ghost' })],
      applications: [buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) })],
    });
    await scanDeadlines(deps, { now: NOW });
    expect(kinds(deps).map(([user]) => user).sort()).toEqual(['admin_1', 'user_test']);
  });

  it('skips applications whose job is missing', async () => {
    const deps = world({ applications: [buildApplication({ organizationId: ORG_A, jobId: 'missing', responseDueAt: at(HOUR) })] });
    expect((await scanDeadlines(deps, { now: NOW })).digests).toEqual([]);
  });

  it('keeps organizations apart: recipients and notifications stay in the organization of the application', async () => {
    const deps = world({
      members: {
        [ORG_A]: [{ userId: 'user_test', name: 'A Owner', email: 'a@a.example', roles: ['owner'] }],
        [ORG_B]: [{ userId: 'b_owner', name: 'B Owner', email: 'b@b.example', roles: ['owner'] }],
      },
      jobs: [
        buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published' }),
        buildJob({ id: 'job_b', organizationId: ORG_B, status: 'published', createdBy: 'b_owner' }),
      ],
      applications: [
        buildApplication({ organizationId: ORG_A, responseDueAt: at(-3 * DAY) }),
        buildApplication({ id: 'app_b', organizationId: ORG_B, jobId: 'job_b', candidateId: 'cand_b', responseDueAt: at(-3 * DAY) }),
      ],
    });
    await scanDeadlines(deps, { now: NOW });
    expect(deps.notifications.snapshot().map((n) => [n.organizationId, n.userId]).sort()).toEqual([[ORG_A, 'user_test'], [ORG_B, 'b_owner']]);
  });

  it('notifies the assignee of a task due within 24h, once, and ignores completed or distant ones', async () => {
    const deps = world({
      tasks: [
        buildTask({ id: 't_soon', assigneeId: 'hm_1', dueAt: at(5 * HOUR) }),
        buildTask({ id: 't_late', assigneeId: 'hm_1', dueAt: at(3 * DAY) }),
        buildTask({ id: 't_done', assigneeId: 'hm_1', dueAt: at(HOUR), completedAt: NOW }),
        buildTask({ id: 't_free', assigneeId: 'hm_1', dueAt: null }),
      ],
    });
    const first = await scanDeadlines(deps, { now: NOW });
    await scanDeadlines(deps, { now: at(HOUR) });
    expect(deps.notifications.snapshot()).toEqual([expect.objectContaining({ userId: 'hm_1', kind: 'task_due', taskId: 't_soon' })]);
    expect(first.digests).toEqual([expect.objectContaining({ userId: 'hm_1', email: 'hugo@acme.example' })]);
  });

  it('groups the new notifications of one user in one digest and leaves out users who are no longer members', async () => {
    const deps = world({
      candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, email: 'b@x.it' })],
      applications: [
        buildApplication({ organizationId: ORG_A, responseDueAt: at(HOUR) }),
        buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A, responseDueAt: at(2 * HOUR) }),
      ],
      tasks: [buildTask({ assigneeId: 'ghost', dueAt: at(HOUR) })],
      rules: [buildAutomationRule()],
    });
    const { digests } = await scanDeadlines(deps, { now: NOW });
    expect(digests).toHaveLength(1);
    expect(digests[0]?.notifications).toHaveLength(2);
    expect(deps.notifications.snapshot()).toHaveLength(3);
  });

  it('validates its input', async () => {
    await expect(scanDeadlines(world(), { now: 'yesterday' })).rejects.toBeInstanceOf(ValidationError);
  });
});
