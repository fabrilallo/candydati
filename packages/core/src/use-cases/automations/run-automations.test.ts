import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../errors.js';
import {
  buildApplication,
  buildAutomationRule,
  buildEmailTemplate,
  seedAutomationWorld,
  systemActor,
  ORG_A,
  ORG_B,
  type AutomationSeedOptions,
} from '../../testing/index.js';
import { deliverMessage } from '../messaging/deliver-message.js';
import { runAutomations } from './run-automations.js';

const worker = systemActor({ organizationId: ORG_A });
const NOW = new Date('2026-06-01T10:00:00.000Z');
const input = (overrides = {}) => ({ organizationId: ORG_A, applicationId: 'app_1', stageId: 'stage-0', ...overrides });
const world = (options: AutomationSeedOptions = {}) =>
  seedAutomationWorld({
    applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0' })],
    messaging: { templates: [buildEmailTemplate({ id: 'tpl_1', organizationId: ORG_A })] },
    ...options,
  });
const sendRule = (overrides = {}) =>
  buildAutomationRule({ id: 'rule_send', action: { type: 'send_template', templateId: 'tpl_1' }, createdBy: 'recruiter_1', ...overrides });

describe('runAutomations: send_template', () => {
  it('queues the message in the name of the rule creator and the message is delivered like any other', async () => {
    const deps = world({ rules: [sendRule()] });
    expect(await runAutomations(deps, worker, input())).toEqual({ executed: 1, failed: 0, skipped: null });
    const [message] = deps.messagingStore.read().messages;
    expect(message).toMatchObject({ direction: 'outbound', status: 'queued', sentBy: 'recruiter_1', applicationId: 'app_1', subject: 'Hi Ada', bodyText: 'Hello Ada, about Backend Developer.' });
    expect(deps.queue.jobs()).toEqual([{ name: 'email.send', payload: { organizationId: ORG_A, messageId: message?.id } }]);
    expect(deps.auditLog.events()).toEqual([
      expect.objectContaining({ action: 'automation.ran', target: { type: 'automation_rule', id: 'rule_send' }, metadata: { applicationId: 'app_1', action: 'send_template', ok: true } }),
    ]);
    expect(await deliverMessage(deps, worker, { organizationId: ORG_A, messageId: message?.id ?? '' })).toBe('sent');
  });

  it('uses a built-in default template in the language of the ad', async () => {
    const deps = world({ rules: [sendRule({ action: { type: 'send_template', templateId: 'default:stage_update' } })] });
    await runAutomations(deps, worker, input());
    expect(deps.messagingStore.read().messages).toHaveLength(1);
  });

  it('queueing the message does not answer the stage: only its delivery does', async () => {
    const deps = world({ rules: [sendRule()] });
    deps.store.write({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0', responseDueAt: new Date('2026-06-05T00:00:00Z'), stageChangedAt: new Date('2026-06-01T00:00:00Z') })] });
    await runAutomations(deps, worker, input());
    expect(deps.store.read().applications[0]?.respondedAt).toBeNull();
  });

  it('notifies the creator when the template is gone, and still runs the other rules', async () => {
    const deps = world({
      rules: [
        sendRule({ id: 'broken', action: { type: 'send_template', templateId: 'deleted' }, createdAt: new Date('2026-01-01') }),
        buildAutomationRule({ id: 'ok', createdAt: new Date('2026-01-02') }),
      ],
    });
    expect(await runAutomations(deps, worker, input())).toEqual({ executed: 1, failed: 1, skipped: null });
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'automation_failed')).toEqual([
      expect.objectContaining({ userId: 'recruiter_1', kind: 'automation_failed', applicationId: 'app_1', jobId: 'job_1', payload: { ruleId: 'broken', action: 'send_template' } }),
    ]);
    expect(deps.tasks.snapshot()).toHaveLength(1);
    expect(deps.auditLog.events().map((e) => e.metadata.ok)).toEqual([false, true]);
    expect(deps.store.read().applications[0]).toMatchObject({ stageId: 'stage-0', outcome: null });
  });

  it('counts a message that could not be queued as a failure', async () => {
    const base = world({ rules: [sendRule()] });
    const deps = { ...base, queue: { enqueue: async () => Promise.reject(new Error('down')) } };
    expect(await runAutomations(deps, worker, input())).toMatchObject({ failed: 1 });
    expect(base.notifications.snapshot()[0]?.kind).toBe('automation_failed');
  });

  it('does not notify twice for the same failing rule and application', async () => {
    const deps = world({ rules: [sendRule({ action: { type: 'send_template', templateId: 'deleted' } })] });
    await runAutomations(deps, worker, input());
    await runAutomations(deps, worker, input());
    expect(deps.notifications.snapshot()).toHaveLength(1);
  });
});

describe('runAutomations: create_task', () => {
  it('creates the task for the job owner by default, with the due date and a task_assigned notification', async () => {
    const deps = world({ rules: [buildAutomationRule({ action: { type: 'create_task', title: 'Prepare', assignee: 'job_owner', dueInDays: 2 } })] });
    await runAutomations(deps, worker, input());
    expect(deps.tasks.snapshot()).toEqual([
      expect.objectContaining({ title: 'Prepare', assigneeId: 'user_test', applicationId: 'app_1', jobId: 'job_1', createdBy: 'recruiter_1', dueAt: new Date(NOW.getTime() + 2 * 86_400_000), completedAt: null }),
    ]);
    expect(deps.notifications.snapshot()).toEqual([expect.objectContaining({ userId: 'user_test', kind: 'task_assigned' })]);
  });

  it('assigns a named member, and fails (notifying the creator) when that member left', async () => {
    const ok = world({ rules: [buildAutomationRule({ action: { type: 'create_task', title: 'T', assignee: 'hm_1' } })] });
    await runAutomations(ok, worker, input());
    expect(ok.tasks.snapshot()[0]?.assigneeId).toBe('hm_1');
    const left = world({ rules: [buildAutomationRule({ action: { type: 'create_task', title: 'T', assignee: 'gone' } })] });
    expect(await runAutomations(left, worker, input())).toMatchObject({ executed: 0, failed: 1 });
    expect(left.notifications.snapshot()[0]).toMatchObject({ userId: 'recruiter_1', kind: 'automation_failed' });
  });
});

describe('runAutomations: guards', () => {
  const rules = [buildAutomationRule(), sendRule()];

  it('never acts on a decided application', async () => {
    const deps = world({ rules, applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0', outcome: 'not_selected', closedAt: NOW })] });
    expect(await runAutomations(deps, worker, input())).toEqual({ executed: 0, failed: 0, skipped: 'decided' });
    expect(deps.tasks.snapshot()).toHaveLength(0);
    expect(deps.messagingStore.read().messages).toHaveLength(0);
    expect(deps.queue.jobs()).toHaveLength(0);
  });

  it('skips when the application already moved on, or is missing', async () => {
    const deps = world({ rules });
    expect(await runAutomations(deps, worker, input({ stageId: 'stage-1' }))).toMatchObject({ skipped: 'stage_changed' });
    expect(await runAutomations(deps, worker, input({ applicationId: 'nope' }))).toMatchObject({ skipped: 'application_not_found' });
    expect(deps.tasks.snapshot()).toHaveLength(0);
  });

  it('ignores disabled rules and rules of other stages or jobs', async () => {
    const deps = world({ rules: [buildAutomationRule({ enabled: false }), buildAutomationRule({ id: 'x', stageId: 'stage-1' }), buildAutomationRule({ id: 'y', jobId: 'job_2' })] });
    expect(await runAutomations(deps, worker, input())).toEqual({ executed: 0, failed: 0, skipped: null });
  });

  it('never moves or decides: whatever runs, stage and outcome stay as they were', async () => {
    const deps = world({ rules });
    await runAutomations(deps, worker, input());
    expect(deps.store.read().applications[0]).toMatchObject({ stageId: 'stage-0', outcome: null, closedAt: null });
    expect(deps.outbox.snapshot()).toHaveLength(0);
  });

  it('is scoped to its organization', async () => {
    const deps = world({ rules });
    await expect(runAutomations(deps, systemActor({ organizationId: ORG_B }), input())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await runAutomations(deps, systemActor({ organizationId: ORG_B }), input({ organizationId: ORG_B }))).toMatchObject({ skipped: 'application_not_found' });
  });
});
