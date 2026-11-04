import { assignTaskTitle, DAY_MS, JOB_OWNER_ASSIGNEE, TAGS_PER_CANDIDATE_MAX, type Task } from '@candydati/domain';
import { toAuditActor } from '../../actor.js';
import type { AutomationRunDeps } from '../../automation-ports.js';
import { requestMissingFeedback } from '../feedback/request-on-stage-entry.js';
import { resolveTemplate } from '../messaging/shared.js';
import { sendMessage } from '../messaging/send-message.js';
import { notifyTaskAssigned } from '../tasks/notify.js';
import { assertMember } from '../tasks/tasks.js';
import { ruleActor, type ActionContext } from './action-context.js';

/** The template goes out through the normal messaging path, in the name of the rule's creator. */
export async function sendTemplate(deps: AutomationRunDeps, ctx: ActionContext, templateId: string): Promise<void> {
  const { rule, role, job, application } = ctx;
  const template = await resolveTemplate(deps, rule.organizationId, templateId, job.content.language);
  if (!template) throw new Error('template_missing');
  const result = await sendMessage(deps, ruleActor(rule, role), {
    applicationIds: [application.id],
    templateId,
    subject: template.subject,
    body: template.body,
  });
  if (result.failed > 0) throw new Error('message_not_queued');
}

interface TaskSpec {
  readonly title: string;
  readonly assignee: string;
  readonly dueInDays?: number | undefined;
}

/** A task on the application for a member (or the job owner), who is notified. `unique`: not if one like it is open. */
export async function createTaskFor(deps: AutomationRunDeps, ctx: ActionContext, spec: TaskSpec, unique = false): Promise<void> {
  const { rule, job, application } = ctx;
  const assigneeId = spec.assignee === JOB_OWNER_ASSIGNEE ? job.createdBy : spec.assignee;
  await assertMember(deps, rule.organizationId, assigneeId);
  if (unique) {
    const open = await deps.tasks.listByApplication(rule.organizationId, application.id);
    if (open.some((task) => task.completedAt === null && task.assigneeId === assigneeId && task.title === spec.title)) return;
  }
  const now = deps.now();
  const task: Task = await deps.tasks.create({
    id: deps.newId(),
    organizationId: rule.organizationId,
    applicationId: application.id,
    jobId: job.id,
    title: spec.title,
    assigneeId,
    dueAt: spec.dueInDays === undefined ? null : new Date(now.getTime() + spec.dueInDays * DAY_MS),
    createdBy: rule.createdBy,
    createdAt: now,
    completedAt: null,
  });
  await notifyTaskAssigned(deps, task);
}

/**
 * Applications have no owner field: assigning one gives the person a "follow this application" task, at most one open
 * per person and application.
 */
export const assignApplication = (deps: AutomationRunDeps, ctx: ActionContext, assignee: string, dueInDays: number | undefined): Promise<void> =>
  createTaskFor(deps, ctx, { title: assignTaskTitle(ctx.job.content.language), assignee, dueInDays }, true);

/** Adds the tag to the candidate's profile; a tag already there is left as it is. A full profile is a failure. */
export async function addTag(deps: AutomationRunDeps, ctx: ActionContext, tag: string): Promise<void> {
  const candidate = await deps.candidates.findById(ctx.rule.organizationId, ctx.application.candidateId);
  if (!candidate) throw new Error('candidate_missing');
  if (candidate.tags.includes(tag)) return;
  if (candidate.tags.length >= TAGS_PER_CANDIDATE_MAX) throw new Error('too_many_tags');
  await deps.candidates.save({ ...candidate, tags: [...candidate.tags, tag], updatedAt: deps.now() });
}

/**
 * Asks the interviewers configured for the rule's stage through the normal feedback flow (link by email, reminders by
 * the hourly scan). Nobody who already has a request open or answered for this application and stage is asked again.
 */
export async function requestFeedback(deps: AutomationRunDeps, ctx: ActionContext): Promise<void> {
  if (!deps.feedback) throw new Error('feedback_unavailable');
  const { rule, role, application } = ctx;
  await requestMissingFeedback(
    { ...deps, ...deps.feedback },
    {
      organizationId: rule.organizationId,
      applicationId: application.id,
      stageId: rule.stageId,
      actor: toAuditActor(ruleActor(rule, role)),
      requestedBy: rule.createdBy,
    },
    { requireInterviewers: true },
  );
}
