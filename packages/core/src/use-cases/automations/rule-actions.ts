import type { AutomationActionType, AutomationRule, Permission, Role } from '@candydati/domain';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { allowedRole, type ActionContext } from './action-context.js';
import { notify, proposeMove } from './action-alerts.js';
import { addTag, assignApplication, createTaskFor, requestFeedback, sendTemplate } from './action-handlers.js';

/**
 * The permission the creator of a rule must hold, at run time, for its action: a rule never acts with more than its
 * creator has today. `propose_move` needs `candidate:move` although it moves nothing: it suggests what its creator could do.
 */
export const ACTION_PERMISSION: Readonly<Record<AutomationActionType, Permission>> = {
  send_template: 'message:send',
  create_task: 'task:manage',
  add_tag: 'candidate:update',
  assign: 'task:manage',
  request_feedback: 'feedback:manage',
  notify: 'automation:manage',
  propose_move: 'candidate:move',
};
const ADMIN_ROLES = ['owner', 'admin'];

/**
 * The role the creator holds NOW that allows the rule's action and still reaches the rule's job (per-job access), or
 * null when they left the organization, lost the permission or left the job's team.
 */
export async function currentRole(deps: AutomationRunDeps, rule: AutomationRule): Promise<Role | null> {
  const member = (await deps.members.list(rule.organizationId)).find((m) => m.userId === rule.createdBy);
  return allowedRole(deps, rule.organizationId, member, ACTION_PERMISSION[rule.action.type], rule.jobId);
}

/** Owners and admins hear once per rule that it stopped running: its creator is gone or no longer allowed. */
export async function notifyCreatorUnauthorized(deps: AutomationRunDeps, rule: AutomationRule, applicationId: string): Promise<void> {
  const admins = (await deps.members.list(rule.organizationId)).filter((m) => m.roles.some((role) => ADMIN_ROLES.includes(role)));
  for (const admin of admins) {
    await deps.notifications.createIfAbsent(
      {
        id: deps.newId(),
        organizationId: rule.organizationId,
        userId: admin.userId,
        kind: 'automation_failed',
        applicationId,
        jobId: rule.jobId,
        taskId: null,
        payload: { ruleId: rule.id, action: rule.action.type, reason: 'creator_not_authorized' },
        createdAt: deps.now(),
        readAt: null,
      },
      `automation_creator_not_authorized:${rule.id}`,
    );
  }
}

/**
 * The creator of the rule hears about it, once per occurrence: the stage change is never undone, but nobody should
 * wonder why nothing was sent. Entry runs (empty occurrence) keep the key they always had.
 */
export async function notifyFailure(deps: AutomationRunDeps, rule: AutomationRule, applicationId: string, occurrence: string): Promise<void> {
  await deps.notifications.createIfAbsent(
    {
      id: deps.newId(),
      organizationId: rule.organizationId,
      userId: rule.createdBy,
      kind: 'automation_failed',
      applicationId,
      jobId: rule.jobId,
      taskId: null,
      payload: { ruleId: rule.id, action: rule.action.type },
      createdAt: deps.now(),
      readAt: null,
    },
    `automation_failed:${rule.id}:${applicationId}:${rule.stageId}${occurrence === '' ? '' : `:${occurrence}`}`,
  );
}

/**
 * The rule's action. None of them moves, decides, scores or ranks: `propose_move` only writes a proposal that a person
 * confirms or dismisses (PRODUCT.md §2.4).
 */
export async function executeAction(deps: AutomationRunDeps, ctx: ActionContext): Promise<void> {
  const { action } = ctx.rule;
  switch (action.type) {
    case 'send_template':
      return sendTemplate(deps, ctx, action.templateId);
    case 'create_task':
      return createTaskFor(deps, ctx, action);
    case 'add_tag':
      return addTag(deps, ctx, action.tag);
    case 'assign':
      return assignApplication(deps, ctx, action.assignee, action.dueInDays);
    case 'request_feedback':
      return requestFeedback(deps, ctx);
    case 'notify':
      return notify(deps, ctx, action.channel, action.recipients);
    case 'propose_move':
      return proposeMove(deps, ctx, action.toStageId);
  }
}
