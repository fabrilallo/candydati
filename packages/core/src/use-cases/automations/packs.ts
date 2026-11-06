import { automationPackInputSchema, automationPackRuleInputSchema, MAX_PACK_RULES, STAGE_ANCHORS, type AutomationPack, type AutomationPackRule } from '@candydati/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { defineAutomationUseCase } from './define.js';
import { validateRule, type RuleTarget } from './rule-validation.js';

const id = z.string().min(1);

/**
 * A pack serves jobs in any language: its rules may name every anchor, and an email template only has to exist (each
 * built-in default exists in every language; the job's language is checked again when the pack is attached).
 */
const PACK_TARGET: RuleTarget = { stageIds: STAGE_ANCHORS, language: 'it' };

export interface PackSummary {
  readonly pack: AutomationPack;
  readonly ruleCount: number;
  readonly templateIds: readonly string[];
}

export async function requirePack(deps: Pick<AutomationRuleDeps, 'automationPacks'>, organizationId: string, packId: string): Promise<AutomationPack> {
  const pack = await deps.automationPacks.findById(organizationId, packId);
  if (!pack) throw new NotFoundError('Automation pack not found.');
  return pack;
}

async function requirePackRule(deps: AutomationRuleDeps, organizationId: string, ruleId: string): Promise<AutomationPackRule> {
  const rule = await deps.automationPacks.findRule(organizationId, ruleId);
  if (!rule) throw new NotFoundError('Automation rule not found.');
  return rule;
}

async function assertNameFree(deps: AutomationRuleDeps, organizationId: string, name: string, self: string | null): Promise<void> {
  const taken = await deps.automationPacks.findByName(organizationId, name);
  if (taken && taken.id !== self) throw new ConflictError('An automation pack with this name already exists.');
}

const packAudit = (action: 'automation_pack.saved' | 'automation_pack.deleted') => ({
  action,
  target: (_input: unknown, pack: AutomationPack) => ({ type: 'automation_pack', id: pack.id }),
  metadata: (_input: unknown, pack: AutomationPack) => ({ name: pack.name }),
});

export const listPacks = defineAutomationUseCase({
  name: 'listPacks',
  input: z.object({}),
  permission: 'automation:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor }): Promise<readonly PackSummary[]> => {
    const { organizationId } = actor;
    const [packs, counts, templates] = await Promise.all([deps.automationPacks.list(organizationId), deps.automationPacks.countRules(organizationId), deps.templatePacks.templatesByPack(organizationId)]);
    return packs.map((pack) => ({ pack, ruleCount: counts[pack.id] ?? 0, templateIds: templates[pack.id] ?? [] }));
  },
});

export const createPack = defineAutomationUseCase({
  name: 'createPack',
  input: automationPackInputSchema,
  permission: 'automation:manage',
  audit: packAudit('automation_pack.saved'),
  handler: async ({ deps, actor, input }): Promise<AutomationPack> => {
    await assertNameFree(deps, actor.organizationId, input.name, null);
    const now = deps.now();
    return deps.automationPacks.create({ id: deps.newId(), organizationId: actor.organizationId, ...input, createdBy: toActorUserId(actor), createdAt: now, updatedAt: now });
  },
});

export const updatePack = defineAutomationUseCase({
  name: 'updatePack',
  input: automationPackInputSchema.extend({ packId: id }),
  permission: 'automation:manage',
  audit: packAudit('automation_pack.saved'),
  handler: async ({ deps, actor, input }): Promise<AutomationPack> => {
    const pack = await requirePack(deps, actor.organizationId, input.packId);
    await assertNameFree(deps, actor.organizationId, input.name, pack.id);
    return deps.automationPacks.save({ ...pack, name: input.name, description: input.description, updatedAt: deps.now() });
  },
});

/** The pack and its rules go; jobs keep the rules copied from it, and templates stop bringing it. */
export const deletePack = defineAutomationUseCase({
  name: 'deletePack',
  input: z.object({ packId: id }),
  permission: 'automation:manage',
  audit: packAudit('automation_pack.deleted'),
  handler: async ({ deps, actor, input }): Promise<AutomationPack> => {
    const pack = await requirePack(deps, actor.organizationId, input.packId);
    await deps.automationPacks.delete(actor.organizationId, pack.id);
    return pack;
  },
});

export const listPackRules = defineAutomationUseCase({
  name: 'listPackRules',
  input: z.object({ packId: id }),
  permission: 'automation:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor, input }): Promise<readonly AutomationPackRule[]> => {
    await requirePack(deps, actor.organizationId, input.packId);
    return deps.automationPacks.listRules(actor.organizationId, input.packId);
  },
});

const ruleAudit = (action: 'automation.saved' | 'automation.deleted') => ({
  action,
  target: (_input: unknown, rule: AutomationPackRule) => ({ type: 'automation_pack_rule', id: rule.id }),
  metadata: (_input: unknown, rule: AutomationPackRule) => ({ packId: rule.packId, stage: rule.stage, trigger: rule.trigger.type, action: rule.action.type }),
});

type PackRuleShape = Pick<AutomationPackRule, 'stage' | 'action'>;

async function validatePackRule(deps: AutomationRuleDeps, organizationId: string, rule: PackRuleShape): Promise<void> {
  await validateRule(deps, organizationId, PACK_TARGET, { stageId: rule.stage, action: rule.action }).catch((error: unknown) => {
    if (error instanceof ValidationError) throw new ValidationError(error.issues.map((issue) => (issue.path === 'stageId' ? { ...issue, path: 'stage' } : issue)));
    throw error;
  });
}

const MAX_RULES_MESSAGE = `An automation pack holds at most ${MAX_PACK_RULES} rules.`;

/** A rule of a pack: anchored to a stage type, copied into each job the pack is attached to, in that person's name. */
export const createPackRule = defineAutomationUseCase({
  name: 'createPackRule',
  input: automationPackRuleInputSchema.and(z.object({ packId: id })),
  permission: 'automation:manage',
  audit: ruleAudit('automation.saved'),
  handler: async ({ deps, actor, input }): Promise<AutomationPackRule> => {
    const pack = await requirePack(deps, actor.organizationId, input.packId);
    const existing = await deps.automationPacks.listRules(actor.organizationId, pack.id);
    if (existing.length >= MAX_PACK_RULES) throw new ConflictError(MAX_RULES_MESSAGE);
    await validatePackRule(deps, actor.organizationId, input);
    const { stage, trigger, conditions, action, enabled } = input;
    return deps.automationPacks.createRule({
      id: deps.newId(),
      organizationId: actor.organizationId,
      packId: pack.id,
      stage,
      trigger,
      conditions,
      action,
      enabled,
      createdBy: toActorUserId(actor),
      createdAt: deps.now(),
    });
  },
});

/** Full replacement of stage, trigger, conditions, action and switch; jobs keep what they already copied. */
export const updatePackRule = defineAutomationUseCase({
  name: 'updatePackRule',
  input: automationPackRuleInputSchema.and(z.object({ ruleId: id })),
  permission: 'automation:manage',
  audit: ruleAudit('automation.saved'),
  handler: async ({ deps, actor, input }): Promise<AutomationPackRule> => {
    const rule = await requirePackRule(deps, actor.organizationId, input.ruleId);
    await validatePackRule(deps, actor.organizationId, input);
    const { stage, trigger, conditions, action, enabled } = input;
    return deps.automationPacks.saveRule({ ...rule, stage, trigger, conditions, action, enabled });
  },
});

export const deletePackRule = defineAutomationUseCase({
  name: 'deletePackRule',
  input: z.object({ ruleId: id }),
  permission: 'automation:manage',
  audit: ruleAudit('automation.deleted'),
  handler: async ({ deps, actor, input }): Promise<AutomationPackRule> => {
    const rule = await requirePackRule(deps, actor.organizationId, input.ruleId);
    await deps.automationPacks.deleteRule(actor.organizationId, rule.id);
    return rule;
  },
});
