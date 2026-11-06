import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildAutomationRule, buildJob, buildJobTemplate, buildPack, buildPackRule, seedAutomationWorld, userActor, ORG_A } from '../../testing/index.js';
import { createJob } from '../jobs/create-job.js';
import { attachPack, listTemplatePacks, setTemplatePacks } from './attach-pack.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const manager = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });

/** `job_1` has stages received, stage-0 (hr_interview), stage-1 (technical_interview). */
const rules = [
  buildPackRule({ id: 'p_feedback' }),
  buildPackRule({ id: 'p_tag', stage: 'received', action: { type: 'add_tag', tag: 'new' } }),
  buildPackRule({ id: 'p_case', stage: 'case_study' }),
  buildPackRule({ id: 'p_move', stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'technical_interview' } }),
  buildPackRule({ id: 'p_gone', stage: 'received', action: { type: 'create_task', title: 'Call', assignee: 'left_the_company' } }),
];
const world = (extra: Parameters<typeof seedAutomationWorld>[0] = {}) => seedAutomationWorld({ packs: [buildPack()], packRules: rules, ...extra });

describe('attachPack', () => {
  it('copies each rule onto the job stages of its type, as the attaching person, and reports what found no place', async () => {
    const deps = world();
    const result = await attachPack(deps, recruiter, { jobId: 'job_1', packId: 'pack_1' });
    expect(result.skipped).toEqual([
      { ruleId: 'p_case', reason: 'no_stage', stageId: null },
      { ruleId: 'p_gone', reason: 'invalid', stageId: null },
    ]);
    const copied = deps.rules.snapshot();
    expect(copied.map((r) => [r.stageId, r.action.type])).toEqual([
      ['stage-1', 'request_feedback'],
      ['received', 'add_tag'],
      ['stage-0', 'propose_move'],
    ]);
    expect(copied.every((r) => r.packId === 'pack_1' && r.createdBy === 'recruiter_1' && r.jobId === 'job_1')).toBe(true);
    expect(copied.map((r) => r.packRuleId)).toEqual(['p_feedback', 'p_tag', 'p_move']);
    expect(copied[2]?.action).toEqual({ type: 'propose_move', toStageId: 'stage-1' });
    expect(result.created).toEqual(copied.map((r) => r.id));
    expect(deps.auditLog.events()[0]).toMatchObject({
      action: 'automation.copied',
      target: { type: 'job', id: 'job_1' },
      metadata: { from: { kind: 'pack', packId: 'pack_1' }, count: 3, updated: 0, removed: 0, skipped: 2 },
    });
  });

  it('attached again, updates its copies in place (same ids, so timed triggers do not fire twice) and leaves the job own rules alone', async () => {
    const own = buildAutomationRule({ id: 'own', organizationId: ORG_A });
    const deps = world({ rules: [own] });
    const first = await attachPack(deps, recruiter, { jobId: 'job_1', packId: 'pack_1' });
    await deps.automationPacks.saveRule({ ...rules[1]!, action: { type: 'add_tag', tag: 'inbound' } });
    await deps.automationPacks.deleteRule(ORG_A, 'p_feedback');
    await deps.automationPacks.createRule(buildPackRule({ id: 'p_offer', stage: 'hr_interview', action: { type: 'add_tag', tag: 'hr' } }));
    const again = await attachPack(deps, recruiter, { jobId: 'job_1', packId: 'pack_1' });
    expect(again.updated).toEqual([first.created[1], first.created[2]]);
    expect(again.removed).toBe(1);
    expect(again.created).toHaveLength(1);
    const after = deps.rules.snapshot();
    expect(after.find((r) => r.id === first.created[1])?.action).toEqual({ type: 'add_tag', tag: 'inbound' });
    expect(after.some((r) => r.id === first.created[0])).toBe(false);
    expect(after.some((r) => r.id === 'own')).toBe(true);
    expect(deps.auditLog.events()[1]?.metadata).toMatchObject({ count: 1, updated: 2, removed: 1 });
  });

  it('refuses a closed job, an unknown pack and people who do not manage automations', async () => {
    await expect(attachPack(world({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'closed' })] }), recruiter, { jobId: 'job_1', packId: 'pack_1' })).rejects.toBeInstanceOf(ConflictError);
    await expect(attachPack(world(), recruiter, { jobId: 'job_1', packId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(attachPack(world(), manager, { jobId: 'job_1', packId: 'pack_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('template packs', () => {
  const withTemplate = async () => {
    const deps = world({ packs: [buildPack(), buildPack({ id: 'pack_2', name: 'Agency' })], packRules: [rules[0]!, rules[1]!] });
    await deps.jobTemplates.create(buildJobTemplate({ id: 'tmpl_1', organizationId: ORG_A }));
    return deps;
  };

  it('sets the packs a template brings, in order, audited', async () => {
    const deps = await withTemplate();
    await setTemplatePacks(deps, recruiter, { templateId: 'tmpl_1', packIds: ['pack_2', 'pack_1'] });
    expect(await listTemplatePacks(deps, recruiter, { templateId: 'tmpl_1' })).toEqual(['pack_2', 'pack_1']);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'job_template.packs_updated', target: { type: 'job_template', id: 'tmpl_1' }, metadata: { packIds: ['pack_2', 'pack_1'] } });
  });

  it('refuses unknown packs and duplicates', async () => {
    const deps = await withTemplate();
    await expect(setTemplatePacks(deps, recruiter, { templateId: 'tmpl_1', packIds: ['nope'] })).rejects.toBeInstanceOf(ValidationError);
    await expect(setTemplatePacks(deps, recruiter, { templateId: 'tmpl_1', packIds: ['pack_1', 'pack_1'] })).rejects.toBeInstanceOf(ValidationError);
    await expect(setTemplatePacks(deps, recruiter, { templateId: 'missing', packIds: [] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a job created from the template gets the rules of its packs and of the packs picked on creation', async () => {
    const deps = await withTemplate();
    await setTemplatePacks(deps, recruiter, { templateId: 'tmpl_1', packIds: ['pack_1'] });
    const job = await createJob(deps, recruiter, { templateId: 'tmpl_1', content: {}, automationPackIds: ['pack_2', 'pack_1'] });
    const copied = deps.rules.snapshot().filter((r) => r.jobId === job.id);
    expect(copied.map((r) => r.packId)).toEqual(['pack_1', 'pack_1']);
    expect(deps.auditLog.events().filter((e) => e.action === 'automation.copied').map((e) => e.metadata)).toEqual([
      expect.objectContaining({ from: { kind: 'pack', packId: 'pack_1' }, count: 2 }),
    ]);
  });

  it('picking packs on creation needs the automation permission', async () => {
    const deps = await withTemplate();
    await expect(createJob(deps, manager, { content: { title: 'Dev' }, automationPackIds: ['pack_1'] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
