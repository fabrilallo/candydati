import { actionPeople, JOB_OWNER_ASSIGNEE, pipelineStagesOf, type AutomationAction, type Job, type JobContent, type JobTemplate } from '@candydati/domain';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { ConflictError, ValidationError } from '../../errors.js';
import { resolveTemplate } from '../messaging/shared.js';

/** Where a rule lives: the stages it may name and the language its templates resolve in. */
export interface RuleTarget {
  readonly stageIds: readonly string[];
  readonly language: JobContent['language'];
}

/** A job takes rules while it is not closed. */
export function jobTarget(job: Job): RuleTarget {
  if (job.status === 'closed') throw new ConflictError('A closed job cannot get automation rules.');
  return { stageIds: pipelineStagesOf(job.content.process).map((stage) => stage.id), language: job.content.language };
}

export const templateTarget = (template: JobTemplate): RuleTarget => ({
  stageIds: pipelineStagesOf(template.content.process).map((stage) => stage.id),
  language: template.content.language,
});

type Issue = { readonly path: string; readonly message: string };

async function actionIssues(deps: Pick<AutomationRuleDeps, 'templates' | 'members'>, organizationId: string, target: RuleTarget, stageId: string, action: AutomationAction): Promise<readonly Issue[]> {
  if (action.type === 'send_template') {
    const found = await resolveTemplate(deps, organizationId, action.templateId, target.language);
    return found ? [] : [{ path: 'action.templateId', message: 'unknown_template' }];
  }
  if (action.type === 'propose_move') {
    if (!target.stageIds.includes(action.toStageId)) return [{ path: 'action.toStageId', message: 'unknown_stage' }];
    return action.toStageId === stageId ? [{ path: 'action.toStageId', message: 'same_stage' }] : [];
  }
  const people = actionPeople(action).filter((person) => person !== JOB_OWNER_ASSIGNEE);
  if (people.length === 0) return [];
  const members = new Set((await deps.members.list(organizationId)).map((member) => member.userId));
  const field = action.type === 'notify' ? 'action.recipients' : 'action.assignee';
  return people.some((person) => !members.has(person)) ? [{ path: field, message: 'not_a_member' }] : [];
}

/** What is wrong with a rule for this target: an unknown stage, an unknown template, someone who is not a member. */
export async function ruleIssues(
  deps: Pick<AutomationRuleDeps, 'templates' | 'members'>,
  organizationId: string,
  target: RuleTarget,
  rule: { readonly stageId: string; readonly action: AutomationAction },
): Promise<readonly Issue[]> {
  if (!target.stageIds.includes(rule.stageId)) return [{ path: 'stageId', message: 'unknown_stage' }];
  return actionIssues(deps, organizationId, target, rule.stageId, rule.action);
}

/** The rule can only point at what exists: a stage of the target, a template of this organization, members. */
export async function validateRule(
  deps: Pick<AutomationRuleDeps, 'templates' | 'members'>,
  organizationId: string,
  target: RuleTarget,
  rule: { readonly stageId: string; readonly action: AutomationAction },
): Promise<void> {
  const issues = await ruleIssues(deps, organizationId, target, rule);
  if (issues.length > 0) throw new ValidationError(issues);
}
