import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildAutomationRule, buildJob, completeJobContent, seedAutomationWorld, userActor, ORG_A } from '../../testing/index.js';
import { createJobTemplate } from '../jobs/create-job-template.js';
import { createJob } from '../jobs/create-job.js';
import { copyAutomations } from './copy-rules.js';
import { listTemplateAutomations, deleteTemplateAutomation } from './template-rules.js';

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

  it('refuses people who are not members and templates that do not exist', async () => {
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

describe('copyAutomations with job templates', () => {
  it('a template keeps rules, and a job created from it gets copies made by its creator', async () => {
    const deps = world();
    const template = await createJobTemplate(deps, adam, { name: 'Backend', content: completeJobContent() });
    const first = template.content.process[0]?.id ?? '';
    await copyAutomations(deps, adam, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { templateId: template.id, stageId: first } });
    const kept = await listTemplateAutomations(deps, adam, { templateId: template.id });
    expect(kept.map((r) => [r.stageId, r.createdBy])).toEqual([[first, 'admin_1']]);

    const job = await createJob(deps, rita, { templateId: template.id, content: {} });
    expect((await rulesOf(deps, job.id)).map((r) => [r.stageId, r.action, r.createdBy])).toEqual([[first, task('First'), 'recruiter_1']]);
    expect(deps.auditLog.events().filter((e) => e.action === 'automation.copied').map((e) => e.target)).toContainEqual({ type: 'job', id: job.id });
  });

  it('copies from a template to an existing job, and a template rule can be removed', async () => {
    const deps = world();
    const template = await createJobTemplate(deps, adam, { name: 'Backend', content: completeJobContent() });
    const stage = template.content.process[0]?.id ?? '';
    const { created } = await copyAutomations(deps, adam, { from: { jobId: 'job_1', ruleIds: ['r3'] }, to: { templateId: template.id, stageId: stage } });
    await copyAutomations(deps, rita, { from: { templateId: template.id, stageId: stage }, to: { jobId: 'job_2', stageId: 'stage-1' } });
    expect((await rulesOf(deps, 'job_2')).map((r) => [r.stageId, r.createdBy])).toEqual([['stage-1', 'recruiter_1']]);
    await deleteTemplateAutomation(deps, adam, { ruleId: created[0] });
    expect(await listTemplateAutomations(deps, adam, { templateId: template.id })).toEqual([]);
  });

  it('a hiring manager creating a job from a template gets no rules: they may not manage automations', async () => {
    const deps = world();
    const template = await createJobTemplate(deps, adam, { name: 'Backend', content: completeJobContent() });
    await copyAutomations(deps, adam, { from: { jobId: 'job_1', ruleIds: ['r1'] }, to: { templateId: template.id, stageId: template.content.process[0]?.id ?? '' } });
    const job = await createJob(deps, hugo, { templateId: template.id, content: {} });
    expect(await rulesOf(deps, job.id)).toEqual([]);
  });

  it('a template of another organization is not found', async () => {
    const deps = world();
    const template = await createJobTemplate(deps, adam, { name: 'Backend', content: completeJobContent() });
    await expect(listTemplateAutomations(deps, otherOrg, { templateId: template.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});
