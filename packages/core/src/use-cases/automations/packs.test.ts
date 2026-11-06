import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildEmailTemplate, buildPack, buildPackRule, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { createPack, createPackRule, deletePack, deletePackRule, listPackRules, listPacks, updatePack, updatePackRule } from './packs.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const manager = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });

const world = (options: Parameters<typeof seedAutomationWorld>[0] = {}) =>
  seedAutomationWorld({ messaging: { templates: [buildEmailTemplate({ id: 'tpl_1', organizationId: ORG_A })] }, ...options });
const issues = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as ValidationError).issues;

describe('packs', () => {
  it('creates a pack in the name of its creator, audited, and refuses a second pack with the same name', async () => {
    const deps = world();
    const pack = await createPack(deps, recruiter, { name: ' Tech hiring ', description: 'Feedback after every interview' });
    expect(pack).toMatchObject({ organizationId: ORG_A, name: 'Tech hiring', description: 'Feedback after every interview', createdBy: 'recruiter_1' });
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'automation_pack.saved', target: { type: 'automation_pack', id: pack.id } });
    await expect(createPack(deps, recruiter, { name: 'TECH HIRING' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('is for people who manage automations only', async () => {
    await expect(createPack(world(), manager, { name: 'X' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPacks(world(), manager, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists the packs of the organization with their rule count and the templates that use them', async () => {
    const deps = world({
      packs: [buildPack(), buildPack({ id: 'pack_2', name: 'Agency' }), buildPack({ id: 'pack_b', organizationId: ORG_B, name: 'Other org' })],
      packRules: [buildPackRule(), buildPackRule({ id: 'prule_2' })],
      templatePacks: [{ organizationId: ORG_A, templateId: 'tmpl_1', packId: 'pack_1', position: 0 }],
    });
    const packs = await listPacks(deps, recruiter, {});
    expect(packs.map((p) => [p.pack.name, p.ruleCount, p.templateIds])).toEqual([
      ['Agency', 0, []],
      ['Tech hiring', 2, ['tmpl_1']],
    ]);
  });

  it('renames a pack and deletes it with its rules; another organization cannot reach it', async () => {
    const deps = world({ packs: [buildPack()], packRules: [buildPackRule()] });
    const renamed = await updatePack(deps, recruiter, { packId: 'pack_1', name: 'Engineering', description: 'All tech roles' });
    expect(renamed).toMatchObject({ name: 'Engineering', description: 'All tech roles' });
    const outsider = userActor({ id: 'x', role: 'admin', organizationId: ORG_B });
    await expect(deletePack(deps, outsider, { packId: 'pack_1' })).rejects.toBeInstanceOf(NotFoundError);
    await deletePack(deps, recruiter, { packId: 'pack_1' });
    expect(deps.automationPacks.snapshot()).toEqual({ packs: [], rules: [] });
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['automation_pack.saved', 'automation_pack.deleted']);
  });
});

describe('pack rules', () => {
  it('adds a rule anchored to a stage type, audited with ids only', async () => {
    const deps = world({ packs: [buildPack()] });
    const rule = await createPackRule(deps, recruiter, { packId: 'pack_1', stage: 'received', action: { type: 'send_template', templateId: 'tpl_1' } });
    expect(rule).toMatchObject({ packId: 'pack_1', stage: 'received', trigger: { type: 'stage_entered' }, createdBy: 'recruiter_1' });
    expect(deps.auditLog.events()[0]).toMatchObject({
      action: 'automation.saved',
      target: { type: 'automation_pack_rule', id: rule.id },
      metadata: { packId: 'pack_1', stage: 'received', trigger: 'stage_entered', action: 'send_template' },
    });
    expect((await listPackRules(deps, recruiter, { packId: 'pack_1' })).map((r) => r.id)).toEqual([rule.id]);
  });

  it('refuses an unknown email template, someone who is not a member and a move to the same stage type', async () => {
    const deps = world({ packs: [buildPack()] });
    expect(await issues(createPackRule(deps, recruiter, { packId: 'pack_1', stage: 'received', action: { type: 'send_template', templateId: 'nope' } }))).toEqual([
      { path: 'action.templateId', message: 'unknown_template' },
    ]);
    expect(await issues(createPackRule(deps, recruiter, { packId: 'pack_1', stage: 'received', action: { type: 'create_task', title: 'Call', assignee: 'stranger' } }))).toEqual([
      { path: 'action.assignee', message: 'not_a_member' },
    ]);
    await expect(createPackRule(deps, recruiter, { packId: 'pack_1', stage: 'offer', action: { type: 'propose_move', toStageId: 'offer' } })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPackRule(deps, recruiter, { packId: 'missing', stage: 'offer', action: { type: 'request_feedback' } })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('replaces a rule keeping its creator, and deletes it', async () => {
    const deps = world({ packs: [buildPack()], packRules: [buildPackRule()] });
    const updated = await updatePackRule(deps, recruiter, { ruleId: 'prule_1', stage: 'hr_interview', trigger: { type: 'stage_stuck', days: 5 }, action: { type: 'add_tag', tag: 'Slow' }, enabled: false });
    expect(updated).toMatchObject({ id: 'prule_1', stage: 'hr_interview', trigger: { type: 'stage_stuck', days: 5 }, action: { type: 'add_tag', tag: 'slow' }, enabled: false, createdBy: 'recruiter_1' });
    await deletePackRule(deps, recruiter, { ruleId: 'prule_1' });
    expect(deps.automationPacks.snapshot().rules).toEqual([]);
    await expect(deletePackRule(deps, recruiter, { ruleId: 'prule_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
