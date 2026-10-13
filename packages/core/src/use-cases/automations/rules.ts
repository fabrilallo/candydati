import {
  automationRuleInputSchema,
  JOB_OWNER_ASSIGNEE,
  pipelineStagesOf,
  type AutomationAction,
  type AutomationRule,
  type Job,
} from '@tt/domain';
import { z } from 'zod';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { resolveTemplate } from '../messaging/shared.js';
import { assertMember } from '../tasks/tasks.js';
import { defineAutomationUseCase } from './define.js';

async function requireRule(deps: AutomationRuleDeps, organizationId: string, id: string): Promise<AutomationRule> {
  const rule = await deps.rules.findById(organizationId, id);
  if (!rule) throw new NotFoundError('Automation rule not found.');
  return rule;
}

/** The rule can only point at what exists: a stage of this job, a template of this organization, a member. */
async function validateRule(
  deps: AutomationRuleDeps,
  organizationId: string,
  job: Job,
  stageId: string,
  action: AutomationAction,
): Promise<void> {
  if (job.status === 'closed') throw new ConflictError('A closed job cannot get automation rules.');
  if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === stageId)) {
    throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
  }
  if (action.type === 'send_template') {
    if (!(await resolveTemplate(deps, organizationId, action.templateId, job.content.language))) {
      throw new ValidationError([{ path: 'action.templateId', message: 'unknown_template' }]);
    }
  } else if (action.assignee !== JOB_OWNER_ASSIGNEE) {
    await assertMember(deps, organizationId, action.assignee).catch(() => {
      throw new ValidationError([{ path: 'action.assignee', message: 'not_a_member' }]);
    });
  }
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

/**
 * A rule runs when an application ENTERS the stage. It is configured by a person, so what it sends goes out in that
 * person's name (principle 4: a rule never moves or decides, and the schema has no such action).
 */
export const createAutomation = defineAutomationUseCase({
  name: 'createAutomation',
  input: automationRuleInputSchema.extend({ jobId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.saved',
    target: (_input, rule: AutomationRule) => ({ type: 'automation_rule', id: rule.id }),
    metadata: (_input, rule: AutomationRule) => ({ jobId: rule.jobId, stageId: rule.stageId, action: rule.action.type }),
  },
  handler: async ({ deps, actor, input }): Promise<AutomationRule> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    await validateRule(deps, actor.organizationId, job, input.stageId, input.action);
    return deps.rules.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      jobId: job.id,
      stageId: input.stageId,
      action: input.action,
      enabled: input.enabled,
      createdBy: toActorUserId(actor),
      createdAt: deps.now(),
    });
  },
});

/** Full replacement of stage, action and switch. `createdBy` stays: the messages are still that person's decision. */
export const updateAutomation = defineAutomationUseCase({
  name: 'updateAutomation',
  input: automationRuleInputSchema.extend({ ruleId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.saved',
    target: (_input, rule: AutomationRule) => ({ type: 'automation_rule', id: rule.id }),
    metadata: (_input, rule: AutomationRule) => ({ jobId: rule.jobId, stageId: rule.stageId, action: rule.action.type }),
  },
  handler: async ({ deps, actor, input }): Promise<AutomationRule> => {
    const rule = await requireRule(deps, actor.organizationId, input.ruleId);
    const job = await requireJob(deps, actor.organizationId, rule.jobId);
    await validateRule(deps, actor.organizationId, job, input.stageId, input.action);
    return deps.rules.save({ ...rule, stageId: input.stageId, action: input.action, enabled: input.enabled });
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
