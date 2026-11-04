import { pipelineStagesOf, type Job, type TemplateAutomationRule } from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { can } from '../../authorization.js';
import type { AutomationRuleRepository } from '../../automation-ports.js';
import { NotFoundError } from '../../errors.js';
import type { AuditLogRepository } from '../../ports.js';
import type { TemplateAutomationRepository } from '../../proposal-ports.js';
import { requireTemplate } from './copy-rules.js';
import { defineAutomationUseCase } from './define.js';

/** The rules kept with a job template, oldest first. They reach jobs only as copies, when a job is created from it. */
export const listTemplateAutomations = defineAutomationUseCase({
  name: 'listTemplateAutomations',
  input: z.object({ templateId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor, input }): Promise<readonly TemplateAutomationRule[]> => {
    await requireTemplate(deps, actor.organizationId, input.templateId);
    return deps.templateAutomations.listByTemplate(actor.organizationId, input.templateId);
  },
});

export const deleteTemplateAutomation = defineAutomationUseCase({
  name: 'deleteTemplateAutomation',
  input: z.object({ ruleId: z.string().min(1) }),
  permission: 'automation:manage',
  audit: {
    action: 'automation.deleted',
    target: (_input, rule: TemplateAutomationRule) => ({ type: 'job_template_automation', id: rule.id }),
    metadata: (_input, rule: TemplateAutomationRule) => ({ templateId: rule.templateId, stageId: rule.stageId }),
  },
  handler: async ({ deps, actor, input }): Promise<TemplateAutomationRule> => {
    const rule = await deps.templateAutomations.findById(actor.organizationId, input.ruleId);
    if (!rule) throw new NotFoundError('Automation rule not found.');
    await deps.templateAutomations.delete(actor.organizationId, rule.id);
    return rule;
  },
});

export interface TemplateCopyDeps {
  readonly auditLog: AuditLogRepository;
  readonly automationRules: AutomationRuleRepository;
  readonly templateAutomations?: TemplateAutomationRepository | undefined;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** A template rule fits the job when its stage (and the stage a proposed move points at) is one of the job's. */
const fits = (rule: TemplateAutomationRule, stageIds: readonly string[]): boolean =>
  stageIds.includes(rule.stageId) && (rule.action.type !== 'propose_move' || stageIds.includes(rule.action.toStageId));

/**
 * A job created from a template gets a copy of each template rule whose stages it still has (a job keeps the template's
 * stage ids unless its process was replaced), made by the person who creates the job: they become `createdBy`. Only
 * someone who may manage automations gets them; templates and people named were checked when the rule was copied into
 * the template, and the run checks them again. Audited as `automation.copied`. Returns how many were copied.
 */
export async function copyTemplateRulesToJob(deps: TemplateCopyDeps, actor: Actor, templateId: string, job: Job): Promise<number> {
  if (!deps.templateAutomations || !can(actor, 'automation:manage')) return 0;
  const stageIds = pipelineStagesOf(job.content.process).map((stage) => stage.id);
  const rules = (await deps.templateAutomations.listByTemplate(job.organizationId, templateId)).filter((rule) => fits(rule, stageIds));
  const created: string[] = [];
  for (const { stageId, trigger, conditions, action, enabled } of rules) {
    const id = deps.newId();
    await deps.automationRules.create({ id, organizationId: job.organizationId, jobId: job.id, stageId, trigger, conditions, action, enabled, createdBy: toActorUserId(actor), createdAt: deps.now() });
    created.push(id);
  }
  if (created.length > 0) {
    await deps.auditLog.append({
      organizationId: job.organizationId,
      actor: toAuditActor(actor),
      action: 'automation.copied',
      target: { type: 'job', id: job.id },
      metadata: { from: { kind: 'template', templateId }, count: created.length, ruleIds: created },
    });
  }
  return created.length;
}
