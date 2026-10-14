import { JOB_OWNER_ASSIGNEE, DAY_MS, isRole, roleHasPermission, type Application, type AutomationRule, type Job, type Permission, type Role, type Task } from '@tt/domain';
import { z } from 'zod';
import type { SystemActor } from '../../actor.js';
import { toAuditActor, type Actor } from '../../actor.js';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { inSavepoint } from '../../transaction.js';
import { defineUseCase } from '../../use-case.js';
import { requireApplication } from '../candidates/shared.js';
import { requireJob } from '../jobs/shared.js';
import { resolveTemplate } from '../messaging/shared.js';
import { sendMessage } from '../messaging/send-message.js';
import { notifyTaskAssigned } from '../tasks/notify.js';
import { assertMember } from '../tasks/tasks.js';

const inputSchema = z.object({
  organizationId: z.string().min(1),
  applicationId: z.string().min(1),
  stageId: z.string().min(1),
});

export type AutomationSkipReason = 'application_not_found' | 'decided' | 'stage_changed';

export interface AutomationRunResult {
  readonly executed: number;
  readonly failed: number;
  readonly skipped: AutomationSkipReason | null;
}

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
async function currentRole(deps: AutomationRunDeps, rule: AutomationRule): Promise<Role | null> {
  const member = (await deps.members.list(rule.organizationId)).find((m) => m.userId === rule.createdBy);
  return member?.roles.filter(isRole).find((role) => roleHasPermission(role, NEEDED[rule.action.type])) ?? null;
}

/** Owners and admins hear once per rule that it stopped running: its creator is gone or no longer allowed. */
async function notifyCreatorUnauthorized(deps: AutomationRunDeps, rule: AutomationRule, applicationId: string): Promise<void> {
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

async function execute(deps: AutomationRunDeps, rule: AutomationRule, role: Role, job: Job, applicationId: string): Promise<void> {
  const { action } = rule;
  if (action.type === 'send_template') await sendTemplate(deps, rule, role, job, applicationId, action.templateId);
  else await createTaskFor(deps, rule, job, applicationId, action);
}

/** The creator of the rule hears about it: the stage change is never undone, but nobody should wonder why nothing was sent. */
async function notifyFailure(deps: AutomationRunDeps, rule: AutomationRule, applicationId: string): Promise<void> {
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
    `automation_failed:${rule.id}:${applicationId}:${rule.stageId}`,
  );
}

/** True when this rule had not run yet for this entry of the application into the stage: the run is now claimed. */
const claimRun = (deps: AutomationRunDeps, rule: AutomationRule, application: Application): Promise<boolean> =>
  deps.executions.claim({
    id: deps.newId(),
    organizationId: rule.organizationId,
    ruleId: rule.id,
    applicationId: application.id,
    stageId: application.stageId,
    stageEnteredAt: application.stageChangedAt,
    createdAt: deps.now(),
  });

/**
 * One rule, null when it already ran for this stage entry. Its action runs in a savepoint: a failure (an SQL error
 * included) undoes only what this rule wrote, and the claim, the failure notice and the audit event stay in the
 * transaction, so the other rules go on and the failed one is not retried.
 */
async function runRule(deps: AutomationRunDeps, actor: Actor, rule: AutomationRule, job: Job, application: Application): Promise<boolean | null> {
  if (!(await claimRun(deps, rule, application))) return null;
  const role = await currentRole(deps, rule);
  let ok = false;
  if (role === null) {
    // Skipped, not sent in the name of someone who is gone: admins are told once.
    await notifyCreatorUnauthorized(deps, rule, application.id);
  } else {
    ok = await inSavepoint(deps, (sp) => execute(sp, rule, role, job, application.id)).then(
      () => true,
      () => false,
    );
    if (!ok) await notifyFailure(deps, rule, application.id);
  }
  await deps.auditLog.append({
    organizationId: rule.organizationId,
    actor: toAuditActor(actor),
    action: 'automation.ran',
    target: { type: 'automation_rule', id: rule.id },
    metadata: { applicationId: application.id, action: rule.action.type, ok },
  });
  return ok;
}

/**
 * Worker use case (system actor, task `automation.run`): runs the enabled rules of the stage the application just
 * entered. Re-checks everything when it runs: an application that moved on, was decided or is gone is skipped. Rules run
 * independently; a failing one notifies its creator (`automation_failed`) and never stops the others or undoes the
 * move. A rule whose creator is no longer a member with the needed permission is skipped (admins are told once); the
 * action runs with the creator's current role. There is no rule that moves or decides, so this can never do either (PRODUCT.md §2, principle 4).
 *
 * Idempotent: each rule records its run for this stage entry in the same transaction as what it does, so a redelivered
 * task finds the record and neither sends the template nor creates the task again.
 */
export const runAutomations = defineUseCase<AutomationRunDeps, typeof inputSchema, AutomationRunResult>({
  name: 'runAutomations',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued after a move or an intake; the organization scope still applies' },
  audit: { skip: 'each rule execution is audited in the handler as automation.ran' },
  transaction: 'required',
  handler: async ({ deps, actor, input }): Promise<AutomationRunResult> => {
    const { organizationId } = input;
    const application = await requireApplication(deps, organizationId, input.applicationId).catch(() => null);
    if (!application) return { executed: 0, failed: 0, skipped: 'application_not_found' };
    if (application.outcome !== null) return { executed: 0, failed: 0, skipped: 'decided' };
    if (application.stageId !== input.stageId) return { executed: 0, failed: 0, skipped: 'stage_changed' };
    const job = await requireJob(deps, organizationId, application.jobId);
    const rules = await deps.rules.listEnabledByStage(organizationId, job.id, input.stageId);
    let executed = 0;
    let failed = 0;
    for (const rule of rules) {
      const ran = await runRule(deps, actor, rule, job, application);
      if (ran === null) continue;
      if (ran) executed += 1;
      else failed += 1;
    }
    return { executed, failed, skipped: null };
  },
});
