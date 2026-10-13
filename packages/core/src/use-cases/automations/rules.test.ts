import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildAutomationRule, buildEmailTemplate, buildJob, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { createAutomation, deleteAutomation, listAutomations, updateAutomation } from './rules.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const task = { type: 'create_task', title: 'Prepare' } as const;
const world = (rules = [buildAutomationRule()]) =>
  seedAutomationWorld({ rules, messaging: { templates: [buildEmailTemplate({ id: 'tpl_1', organizationId: ORG_A })] } });
const issues = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as ValidationError).issues;

describe('createAutomation', () => {
  it('stores the rule in the name of its creator and audits ids only', async () => {
    const deps = world([]);
    const rule = await createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: task });
    expect(rule).toMatchObject({ jobId: 'job_1', stageId: 'stage-0', enabled: true, createdBy: 'recruiter_1', action: { type: 'create_task', title: 'Prepare', assignee: 'job_owner' } });
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'automation.saved', target: { type: 'automation_rule', id: rule.id }, metadata: { jobId: 'job_1', stageId: 'stage-0', action: 'create_task' } });
  });

  it('accepts received as a stage, a stored template and a built-in default', async () => {
    const deps = world([]);
    await createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'received', action: { type: 'send_template', templateId: 'tpl_1' } });
    await createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-1', action: { type: 'send_template', templateId: 'default:stage_update' } });
    expect(deps.rules.snapshot()).toHaveLength(2);
  });

  it('refuses an unknown stage, template or assignee, and any move or decide action', async () => {
    const deps = world([]);
    expect(await issues(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'nope', action: task }))).toEqual([{ path: 'stageId', message: 'unknown_stage' }]);
    expect(await issues(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: { type: 'send_template', templateId: 'missing' } }))).toEqual([{ path: 'action.templateId', message: 'unknown_template' }]);
    expect(await issues(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: { type: 'send_template', templateId: 'default:custom' } }))).toHaveLength(1);
    expect(await issues(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: { ...task, assignee: 'stranger' } }))).toEqual([{ path: 'action.assignee', message: 'not_a_member' }]);
    for (const type of ['move', 'decide']) {
      await expect(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: { type, stageId: 'stage-1', outcome: 'not_selected' } })).rejects.toBeInstanceOf(ValidationError);
    }
    expect(deps.rules.snapshot()).toHaveLength(0);
  });

  it('accepts a member as assignee and refuses a closed job', async () => {
    const deps = world([]);
    await expect(createAutomation(deps, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: { ...task, assignee: 'hm_1', dueInDays: 2 } })).resolves.toBeDefined();
    const closed = seedAutomationWorld({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'closed' })] });
    await expect(createAutomation(closed, recruiter, { jobId: 'job_1', stageId: 'stage-0', action: task })).rejects.toBeInstanceOf(ConflictError);
  });

  it('needs automation:manage and a job of the organization', async () => {
    await expect(createAutomation(world([]), userActor({ role: 'hiring_manager', organizationId: ORG_A }), { jobId: 'job_1', stageId: 'stage-0', action: task })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAutomation(world([]), userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_1', stageId: 'stage-0', action: task })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updateAutomation', () => {
  it('replaces stage, action and switch but keeps the creator', async () => {
    const deps = world();
    const rule = await updateAutomation(deps, userActor({ id: 'admin_1', role: 'admin', organizationId: ORG_A }), {
      ruleId: 'rule_1',
      stageId: 'stage-1',
      action: { type: 'create_task', title: 'Other', assignee: 'user_test', dueInDays: 3 },
      enabled: false,
    });
    expect(rule).toMatchObject({ stageId: 'stage-1', enabled: false, createdBy: 'recruiter_1', action: { title: 'Other', dueInDays: 3 } });
    expect(deps.auditLog.events()[0]?.action).toBe('automation.saved');
  });

  it('validates like create and is isolated per organization', async () => {
    await expect(updateAutomation(world(), recruiter, { ruleId: 'rule_1', stageId: 'nope', action: task })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateAutomation(world(), recruiter, { ruleId: 'missing', stageId: 'stage-0', action: task })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateAutomation(world(), userActor({ role: 'owner', organizationId: ORG_B }), { ruleId: 'rule_1', stageId: 'stage-0', action: task })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listAutomations and deleteAutomation', () => {
  it('lists the rules of a job, oldest first', async () => {
    const deps = world([buildAutomationRule({ id: 'b', createdAt: new Date('2026-02-01') }), buildAutomationRule({ id: 'a', createdAt: new Date('2026-01-01') }), buildAutomationRule({ id: 'x', jobId: 'job_2' })]);
    expect((await listAutomations(deps, recruiter, { jobId: 'job_1' })).map((r) => r.id)).toEqual(['a', 'b']);
    await expect(listAutomations(deps, userActor({ role: 'owner', organizationId: ORG_B }), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes and audits; a rule of another organization is not found', async () => {
    const deps = world();
    await deleteAutomation(deps, recruiter, { ruleId: 'rule_1' });
    expect(deps.rules.snapshot()).toHaveLength(0);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'automation.deleted', target: { id: 'rule_1' } });
    await expect(deleteAutomation(world(), userActor({ role: 'owner', organizationId: ORG_B }), { ruleId: 'rule_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
