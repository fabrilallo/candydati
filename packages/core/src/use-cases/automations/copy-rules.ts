import {
  copyAutomationsInputSchema,
  holderOf,
  type AutomationAction,
  type AutomationConditions,
  type AutomationHolder,
  type AutomationTrigger,
  type CopyAutomationsRequest,
  type JobTemplate,
} from '@candydati/domain';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { authorize } from '../../authorization.js';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineAutomationUseCase } from './define.js';
import { jobTarget, ruleIssues, templateTarget, type RuleTarget } from './rule-validation.js';

/** What a copy carries of a rule: everything but its holder, id, creator and creation time. */
export interface RuleShape {
  readonly id: string;
  readonly stageId: string;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationConditions;
  readonly action: AutomationAction;
  readonly enabled: boolean;
}

export interface CopyAutomationsResult {
  readonly to: AutomationHolder;
  readonly stageId: string;
  /** Ids of the new rules, in the order of the source. */
  readonly created: readonly string[];
}

export async function requireTemplate(deps: Pick<AutomationRuleDeps, 'jobTemplates'>, organizationId: string, templateId: string): Promise<JobTemplate> {
  const template = await deps.jobTemplates.findById(organizationId, templateId);
  if (!template) throw new NotFoundError('Template not found.');
  return template;
}

async function rulesOf(deps: AutomationRuleDeps, actor: Actor, holder: AutomationHolder): Promise<readonly RuleShape[]> {
  if (holder.kind === 'job') {
    await requireJob(deps, actor.organizationId, holder.jobId);
    return deps.rules.listByJob(actor.organizationId, holder.jobId);
  }
  authorize(actor, 'job_template:read');
  await requireTemplate(deps, actor.organizationId, holder.templateId);
  return deps.templateAutomations.listByTemplate(actor.organizationId, holder.templateId);
}

/** The chosen rules of the source, in its order: all of `ruleIds` (every one must exist there), or every rule of `stageId`. */
async function sourceRules(deps: AutomationRuleDeps, actor: Actor, from: CopyAutomationsRequest['from']): Promise<readonly RuleShape[]> {
  const all = await rulesOf(deps, actor, holderOf(from));
  if (from.ruleIds === undefined) {
    const ofStage = all.filter((rule) => rule.stageId === from.stageId);
    if (ofStage.length === 0) throw new ValidationError([{ path: 'from.stageId', message: 'no_rules' }]);
    return ofStage;
  }
  const wanted = new Set(from.ruleIds);
  const chosen = all.filter((rule) => wanted.has(rule.id));
  if (chosen.length !== wanted.size) throw new NotFoundError('Automation rule not found.');
  return chosen;
}

async function targetOf(deps: AutomationRuleDeps, actor: Actor, holder: AutomationHolder): Promise<RuleTarget> {
  if (holder.kind === 'job') return jobTarget(await requireJob(deps, actor.organizationId, holder.jobId));
  authorize(actor, 'job_template:create');
  return templateTarget(await requireTemplate(deps, actor.organizationId, holder.templateId));
}

const sameHolder = (a: AutomationHolder, b: AutomationHolder): boolean =>
  a.kind === 'job' ? b.kind === 'job' && a.jobId === b.jobId : b.kind === 'template' && a.templateId === b.templateId;

/** Every copy is checked against the target before anything is written: all or nothing. */
async function validateCopies(deps: AutomationRuleDeps, actor: Actor, target: RuleTarget, copies: readonly RuleShape[]): Promise<void> {
  const issues = [];
  for (const [index, copy] of copies.entries()) {
    for (const issue of await ruleIssues(deps, actor.organizationId, target, copy)) issues.push({ path: `rules.${index}.${issue.path}`, message: issue.message });
  }
  if (issues.length > 0) throw new ValidationError(issues);
}

async function writeCopy(deps: AutomationRuleDeps, actor: Actor, to: AutomationHolder, copy: RuleShape): Promise<string> {
  const { stageId, trigger, conditions, action, enabled } = copy;
  const base = { id: deps.newId(), organizationId: actor.organizationId, stageId, trigger, conditions, action, enabled, createdBy: toActorUserId(actor), createdAt: deps.now() };
  if (to.kind === 'job') return (await deps.rules.create({ ...base, jobId: to.jobId })).id;
  return (await deps.templateAutomations.create({ ...base, templateId: to.templateId })).id;
}

/**
 * Copies rules (some of them, or every rule of a stage) to one stage of the same job, another job, or a job template, and
 * from a template to a job. Each copy is validated against the target (the stage exists, templates resolve in its
 * language, the people named are members, a proposed move points at one of its stages) and becomes the copying person's
 * decision: they are its `createdBy`, so its messages go out in their name.
 */
export const copyAutomations = defineAutomationUseCase({
  name: 'copyAutomations',
  input: copyAutomationsInputSchema,
  permission: 'automation:manage',
  audit: {
    action: 'automation.copied',
    target: (_input, result: CopyAutomationsResult) =>
      result.to.kind === 'job' ? { type: 'job', id: result.to.jobId } : { type: 'job_template', id: result.to.templateId },
    metadata: (input, result: CopyAutomationsResult) => ({ from: holderOf(input.from), stageId: result.stageId, count: result.created.length, ruleIds: result.created }),
  },
  handler: async ({ deps, actor, input }): Promise<CopyAutomationsResult> => {
    const from = holderOf(input.from);
    const to = holderOf(input.to);
    const source = await sourceRules(deps, actor, input.from);
    const target = await targetOf(deps, actor, to);
    if (sameHolder(from, to) && source.some((rule) => rule.stageId === input.to.stageId)) {
      throw new ValidationError([{ path: 'to.stageId', message: 'same_stage' }]);
    }
    const copies = source.map((rule) => ({ ...rule, stageId: input.to.stageId }));
    await validateCopies(deps, actor, target, copies);
    const created: string[] = [];
    for (const copy of copies) created.push(await writeCopy(deps, actor, to, copy));
    return { to, stageId: input.to.stageId, created };
  },
});
