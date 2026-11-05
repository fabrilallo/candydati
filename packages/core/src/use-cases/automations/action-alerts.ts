import {
  JOB_OWNER_ASSIGNEE,
  pipelineStagesOf,
  proposalExpiresAt,
  type NotificationKind,
  type NotifyChannel,
} from '@candydati/domain';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { recordEvent } from '../webhooks/record-event.js';
import { reachingRole, runKey, type ActionContext } from './action-context.js';

type Payload = Readonly<Record<string, string | number | boolean | null>>;

/** Of these people (or `job_owner`), the members who can open the job today: nobody hears about a job they cannot open. */
async function reachableRecipients(deps: AutomationRunDeps, ctx: ActionContext, people: readonly string[]): Promise<readonly string[]> {
  const ids = [...new Set(people.map((person) => (person === JOB_OWNER_ASSIGNEE ? ctx.job.createdBy : person)))];
  const members = await deps.members.list(ctx.rule.organizationId);
  const kept: string[] = [];
  for (const id of ids) {
    const member = members.find((m) => m.userId === id);
    if (member && (await reachingRole(deps, ctx.rule.organizationId, member, ctx.job.id)) !== null) kept.push(id);
  }
  return kept;
}

async function notifyEach(deps: AutomationRunDeps, ctx: ActionContext, userIds: readonly string[], kind: NotificationKind, payload: Payload, key: string): Promise<void> {
  for (const userId of userIds) {
    await deps.notifications.createIfAbsent(
      {
        id: deps.newId(),
        organizationId: ctx.rule.organizationId,
        userId,
        kind,
        applicationId: ctx.application.id,
        jobId: ctx.job.id,
        taskId: null,
        payload,
        createdAt: deps.now(),
        readAt: null,
      },
      key,
    );
  }
}

/**
 * Alerts people about the application: an in-app notification (`email` also puts it in the hourly digest, which names the
 * job and the kind only), or an `automation.notified` webhook event with ids only. Recipients who left or cannot open the
 * job are skipped; when nobody is left, the run fails and the creator hears about it.
 */
export async function notify(deps: AutomationRunDeps, ctx: ActionContext, channel: NotifyChannel, recipients: readonly string[]): Promise<void> {
  const { rule, application, job } = ctx;
  if (channel === 'webhook') {
    await recordEvent(deps, rule.organizationId, 'automation.notified', {
      ruleId: rule.id,
      applicationId: application.id,
      jobId: job.id,
      stageId: rule.stageId,
      trigger: rule.trigger.type,
    });
    return;
  }
  const people = await reachableRecipients(deps, ctx, recipients);
  if (people.length === 0) throw new Error('no_recipients');
  const kind: NotificationKind = channel === 'email' ? 'automation_alert_email' : 'automation_alert';
  await notifyEach(deps, ctx, people, kind, { ruleId: rule.id, stageId: rule.stageId, trigger: rule.trigger.type }, `automation_alert:${runKey(ctx)}`);
}

/**
 * Writes a PROPOSAL to move the application to `toStageId`, and tells the rule's creator and the job owner. It moves
 * nothing: a person confirms it (the normal move, with their own permissions) or dismisses it. An application that
 * already has an open proposal keeps that one; one already in the target stage gets none.
 */
export async function proposeMove(deps: AutomationRunDeps, ctx: ActionContext, toStageId: string): Promise<void> {
  const { rule, job, application } = ctx;
  if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === toStageId)) throw new Error('unknown_stage');
  if (application.stageId === toStageId) return;
  const now = deps.now();
  const proposal = await deps.moveProposals.createIfNoneOpen({
    id: deps.newId(),
    organizationId: rule.organizationId,
    applicationId: application.id,
    jobId: job.id,
    ruleId: rule.id,
    fromStageId: application.stageId,
    toStageId,
    proposedBy: rule.createdBy,
    source: 'rule',
    reason: null,
    status: 'open',
    createdAt: now,
    expiresAt: proposalExpiresAt(now),
    resolvedBy: null,
    resolvedAt: null,
  });
  if (!proposal) return;
  const people = await reachableRecipients(deps, ctx, [rule.createdBy, JOB_OWNER_ASSIGNEE]);
  await notifyEach(deps, ctx, people, 'move_proposed', { proposalId: proposal.id, toStageId }, `move_proposed:${proposal.id}`);
}
