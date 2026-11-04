import { DAY_MS, isRole, JOB_OWNER_ASSIGNEE, roleHasPermission, type AutomationRule, type Job, type Permission, type Role, type Task } from '@candydati/domain';
import type { SystemActor } from '../../actor.js';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { resolveTemplate } from '../messaging/shared.js';
import { sendMessage } from '../messaging/send-message.js';
import { notifyTaskAssigned } from '../tasks/notify.js';
import { assertMember } from '../tasks/tasks.js';

/** Messages go out in the name of the person who configured the rule: `sentBy = rule.createdBy`, with their CURRENT role. */
const ruleActor = (rule: AutomationRule, role: Role): SystemActor => ({
  type: 'system',
  id: rule.createdBy,
  onBehalfOfUserId: null,
  organizationId: rule.organizationId,
  role,
});

const NEEDED: Readonly<Record<AutomationRule['action']['type'], Permission>> = { send_template: 'message:send', create_task: 'task:manage' };
const ADMIN_ROLES = ['owner', 'admin'];

/**
 * The role the creator holds NOW that allows the rule's action, or null when they left the organization or lost the
 * permission: a rule never acts with more than its creator has today.
 */
export async function currentRole(deps: AutomationRunDeps, rule: AutomationRule): Promise<Role | null> {
  const member = (await deps.members.list(rule.organizationId)).find((m) => m.userId === rule.createdBy);
  return member?.roles.filter(isRole).find((role) => roleHasPermission(role, NEEDED[rule.action.type])) ?? null;
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

async function sendTemplate(deps: AutomationRunDeps, rule: AutomationRule, role: Role, job: Job, applicationId: string, templateId: string): Promise<void> {
  const template = await resolveTemplate(deps, rule.organizationId, templateId, job.content.language);
  if (!template) throw new Error('template_missing');
  const result = await sendMessage(deps, ruleActor(rule, role), {
    applicationIds: [applicationId],
    templateId,
    subject: template.subject,
    body: template.body,
  });
  if (result.failed > 0) throw new Error('message_not_queued');
}

async function createTaskFor(
  deps: AutomationRunDeps,
  rule: AutomationRule,
  job: Job,
  applicationId: string,
  action: { readonly title: string; readonly assignee: string; readonly dueInDays?: number | undefined },
): Promise<void> {
  const assigneeId = action.assignee === JOB_OWNER_ASSIGNEE ? job.createdBy : action.assignee;
  await assertMember(deps, rule.organizationId, assigneeId);
  const now = deps.now();
  const task: Task = await deps.tasks.create({
    id: deps.newId(),
    organizationId: rule.organizationId,
    applicationId,
    jobId: job.id,
    title: action.title,
    assigneeId,
    dueAt: action.dueInDays === undefined ? null : new Date(now.getTime() + action.dueInDays * DAY_MS),
    createdBy: rule.createdBy,
    createdAt: now,
    completedAt: null,
  });
  await notifyTaskAssigned(deps, task);
}

/** The rule's action, and only these two: there is no action that moves, decides, scores or ranks. */
export async function executeAction(deps: AutomationRunDeps, rule: AutomationRule, role: Role, job: Job, applicationId: string): Promise<void> {
  const { action } = rule;
  if (action.type === 'send_template') await sendTemplate(deps, rule, role, job, applicationId, action.templateId);
  else await createTaskFor(deps, rule, job, applicationId, action);
}
