import { automationRuleInputSchema, type AutomationRule } from '@candydati/domain';
import { z } from 'zod';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { toActorUserId } from '../../actor-user.js';
import { NotFoundError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineAutomationUseCase } from './define.js';
import { jobTarget, validateRule } from './rule-validation.js';

async function requireRule(deps: AutomationRuleDeps, organizationId: string, id: string): Promise<AutomationRule> {
  const rule = await deps.rules.findById(organizationId, id);
  if (!rule) throw new NotFoundError('Automation rule not found.');
  return rule;
}

export const listAutomations = defineAutomationUseCase({
  name: 'listAutomations',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor, input }): Promise<readonly AutomationRule[]> => {
    await requireJob(deps, actor.organizationId, input.jobId);
    return deps.rules.listByJob(actor.organizationId, input.jobId);
  },
});

const ruleMetadata = (_input: unknown, rule: AutomationRule) => ({ jobId: rule.jobId, stageId: rule.stageId, trigger: rule.trigger.type, action: rule.action.type });

/**
 * A rule runs when its trigger fires for an application of the stage and its conditions hold. It is configured by a
 * person, so what it sends goes out in that person's name (principle 4: a rule never moves or decides, and the schema
 * has no such action).
 */
export const createAutomation = defineAutomationUseCase({
  name: 'createAutomation',
  input: automationRuleInputSchema.extend({ jobId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.saved',
    target: (_input, rule: AutomationRule) => ({ type: 'automation_rule', id: rule.id }),
    metadata: ruleMetadata,
  },
  handler: async ({ deps, actor, input }): Promise<AutomationRule> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    await validateRule(deps, actor.organizationId, jobTarget(job), input);
    return deps.rules.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      jobId: job.id,
      stageId: input.stageId,
      trigger: input.trigger,
      conditions: input.conditions,
      action: input.action,
      enabled: input.enabled,
      packId: null,
      packRuleId: null,
      createdBy: toActorUserId(actor),
      createdAt: deps.now(),
    });
  },
});

/**
 * Full replacement of stage, trigger, conditions, action and switch. `createdBy` stays: the messages are still that
 * person's decision. What the rule already did stays done: a run is recorded per rule and occurrence, so changing the days
 * of a stuck rule does not fire it again for the applications it already acted for.
 */
export const updateAutomation = defineAutomationUseCase({
  name: 'updateAutomation',
  input: automationRuleInputSchema.extend({ ruleId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.saved',
    target: (_input, rule: AutomationRule) => ({ type: 'automation_rule', id: rule.id }),
    metadata: ruleMetadata,
  },
  handler: async ({ deps, actor, input }): Promise<AutomationRule> => {
    const rule = await requireRule(deps, actor.organizationId, input.ruleId);
    const job = await requireJob(deps, actor.organizationId, rule.jobId);
    await validateRule(deps, actor.organizationId, jobTarget(job), input);
    const { stageId, trigger, conditions, action, enabled } = input;
    return deps.rules.save({ ...rule, stageId, trigger, conditions, action, enabled });
  },
});

export const deleteAutomation = defineAutomationUseCase({
  name: 'deleteAutomation',
  input: z.object({ ruleId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.deleted',
    target: (_input, rule: AutomationRule) => ({ type: 'automation_rule', id: rule.id }),
    metadata: (_input, rule: AutomationRule) => ({ jobId: rule.jobId, stageId: rule.stageId }),
  },
  handler: async ({ deps, actor, input }): Promise<AutomationRule> => {
    const rule = await requireRule(deps, actor.organizationId, input.ruleId);
    await deps.rules.delete(actor.organizationId, rule.id);
    return rule;
  },
});
