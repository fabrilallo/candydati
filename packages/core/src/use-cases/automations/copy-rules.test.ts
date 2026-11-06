import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildAutomationRule, buildJob, buildPack, completeJobContent, seedAutomationWorld, userActor, ORG_A } from '../../testing/index.js';
import { copyAutomations } from './copy-rules.js';

const rita = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
const adam = userActor({ organizationId: ORG_A, id: 'admin_1', role: 'admin' });
const hugo = userActor({ organizationId: ORG_A, id: 'hm_1', role: 'hiring_manager' });
const otherOrg = userActor({ organizationId: 'org_b', id: 'bob', role: 'owner' });

const task = (title: string) => ({ type: 'create_task' as const, title, assignee: 'job_owner' });

const world = () =>
  seedAutomationWorld({
    jobs: [buildJob({ organizationId: ORG_A }), buildJob({ id: 'job_2', slug: 'job-2', organizationId: ORG_A, content: completeJobContent({ title: 'Second' }) })],
    rules: [
      buildAutomationRule({ id: 'r1', stageId: 'stage-0', action: task('First') }),
      buildAutomationRule({ id: 'r2', stageId: 'stage-0', action: { type: 'propose_move', toStageId: 'stage-1' } }),
      buildAutomationRule({ id: 'r3', stageId: 'stage-1', action: task('Other stage') }),
    ],
  });

const rulesOf = async (deps: ReturnType<typeof world>, jobId: string) => deps.rules.listByJob(ORG_A, jobId);

describe('copyAutomations between stages and jobs', () => {
  it('copies one rule to another stage of the same job, as the copying person', async () => {
    const deps = world();
    const result = await copyAutomations(deps, adam, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { jobId: 'job_1', stageId: 'stage-1' } });
    expect(result.created).toHaveLength(1);
    const copy = (await rulesOf(deps, 'job_1')).find((rule) => rule.id === result.created[0]);
    expect(copy).toMatchObject({ stageId: 'stage-1', action: task('First'), createdBy: 'admin_1' });
    expect(deps.auditLog.events().map((e) => [e.action, e.target])).toEqual([['automation.copied', { type: 'job', id: 'job_1' }]]);
  });

  it('copies every rule of a stage to another job', async () => {
    const deps = world();
    await copyAutomations(deps, rita, { from: { jobId: 'job_1', stageId: 'stage-0' }, to: { jobId: 'job_2', stageId: 'stage-0' } });
    expect((await rulesOf(deps, 'job_2')).map((r) => [r.stageId, r.action.type, r.createdBy])).toEqual([
      ['stage-0', 'create_task', 'recruiter_1'],
      ['stage-0', 'propose_move', 'recruiter_1'],
    ]);
  });

  it('validates every copy against the target before writing anything', async () => {
    const deps = world();
    const sameStage = copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['r2'] }, to: { jobId: 'job_1', stageId: 'stage-0' } });
    await expect(sameStage).rejects.toBeInstanceOf(ValidationError);
    const proposeToItself = copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['r2'] }, to: { jobId: 'job_1', stageId: 'stage-1' } });
    await expect(proposeToItself).rejects.toMatchObject({ issues: [{ path: 'rules.0.action.toStageId', message: 'same_stage' }] });
    const unknownStage = copyAutomations(deps, rita, { from: { jobId: 'job_1', stageId: 'stage-0' }, to: { jobId: 'job_2', stageId: 'stage-7' } });
    await expect(unknownStage).rejects.toMatchObject({ issues: [{ path: 'rules.0.stageId', message: 'unknown_stage' }, { path: 'rules.1.stageId', message: 'unknown_stage' }] });
    expect(await rulesOf(deps, 'job_2')).toEqual([]);
  });

  it('refuses people who are not members and email templates that do not exist', async () => {
    const deps = seedAutomationWorld({
      jobs: [buildJob({ organizationId: ORG_A }), buildJob({ id: 'job_2', slug: 'job-2', organizationId: ORG_A })],
      rules: [
        buildAutomationRule({ id: 'gone', action: { type: 'assign', assignee: 'left_the_org' } }),
        buildAutomationRule({ id: 'tpl', action: { type: 'send_template', templateId: 'missing-template' } }),
      ],
    });
    const copy = copyAutomations(deps, rita, { from: { jobId: 'job_1', stageId: 'stage-0' }, to: { jobId: 'job_2', stageId: 'stage-1' } });
    await expect(copy).rejects.toMatchObject({ issues: [{ path: 'rules.0.action.assignee', message: 'not_a_member' }, { path: 'rules.1.action.templateId', message: 'unknown_template' }] });
  });

  it('names nothing outside the organization, and needs automation:manage', async () => {
    const deps = world();
    await expect(copyAutomations(deps, otherOrg, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { jobId: 'job_1', stageId: 'stage-1' } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['r1', 'nope'] }, to: { jobId: 'job_1', stageId: 'stage-1' } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(copyAutomations(deps, hugo, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { jobId: 'job_1', stageId: 'stage-1' } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('copyAutomations into a pack', () => {
  const withPack = () => seedAutomationWorld({
    jobs: [buildJob({ organizationId: ORG_A })],
    packs: [buildPack({ organizationId: ORG_A })],
    rules: [
      buildAutomationRule({ id: 'r1', stageId: 'stage-0', action: task('First') }),
      buildAutomationRule({ id: 'r2', stageId: 'stage-0', action: { type: 'propose_move', toStageId: 'stage-1' } }),
      buildAutomationRule({ id: 'back', stageId: 'stage-1', action: { type: 'propose_move', toStageId: 'received' } }),
    ],
  });

  it('writes the rules on a stage type, a proposed move pointing at the type of its target stage', async () => {
    const deps = withPack();
    const result = await copyAutomations(deps, rita, { from: { jobId: 'job_1', stageId: 'stage-0' }, to: { packId: 'pack_1', stageId: 'hr_interview' } });
    expect(result.to).toEqual({ kind: 'pack', packId: 'pack_1' });
    expect(deps.automationPacks.snapshot().rules.map((r) => [r.stage, r.action, r.createdBy])).toEqual([
      ['hr_interview', task('First'), 'recruiter_1'],
      ['hr_interview', { type: 'propose_move', toStageId: 'technical_interview' }, 'recruiter_1'],
    ]);
    expect(deps.auditLog.events().map((e) => e.target)).toEqual([{ type: 'automation_pack', id: 'pack_1' }]);
  });

  it('refuses a stage that is not a type, a move back to received and an unknown pack', async () => {
    const deps = withPack();
    await expect(copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { packId: 'pack_1', stageId: 'stage-0' } })).rejects.toBeInstanceOf(ValidationError);
    await expect(copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['back'] }, to: { packId: 'pack_1', stageId: 'offer' } })).rejects.toMatchObject({ issues: [{ path: 'rules.0.action.toStageId', message: 'unknown_stage' }] });
    await expect(copyAutomations(deps, rita, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { packId: 'nope', stageId: 'offer' } })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.automationPacks.snapshot().rules).toEqual([]);
  });
});
