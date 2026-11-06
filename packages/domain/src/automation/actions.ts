import { z } from 'zod';
import { TAG_MAX } from '../candidate/application.js';
import { TASK_TITLE_MAX } from '../task/task.js';

/**
 * What a rule may do when its trigger fires (`trigger.ts`). None of these moves, decides, scores or ranks
 * (PRODUCT.md §2.4): `propose_move` only writes a proposal that a person confirms or dismisses; the move itself is always
 * that person's, through the normal move with their permissions.
 */
export const AUTOMATION_ACTIONS = ['send_template', 'create_task', 'add_tag', 'assign', 'request_feedback', 'notify', 'propose_move'] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];

/** The assignee of an automatic task or alert: the owner of the job, or a user id. */
export const JOB_OWNER_ASSIGNEE = 'job_owner';
export const MAX_DUE_IN_DAYS = 90;
export const MAX_NOTIFY_RECIPIENTS = 10;

/**
 * Where a `notify` alert goes. `in_app`: a notification for each recipient. `email`: the same notification, also carried
 * by the hourly email digest (job title, the candidate's first name and surname initial, the stage; never a full name or contact). `webhook`: an `automation.notified`
 * event to the organization's endpoints that subscribe to it (ids only).
 */
export const NOTIFY_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const assigneeSchema = z.string().min(1);

const notifyActionSchema = z
  .object({
    type: z.literal('notify'),
    channel: z.enum(NOTIFY_CHANNELS),
    /** Members (or `job_owner`) to alert. Not used by `webhook`, which goes to endpoints. */
    recipients: z.array(assigneeSchema).max(MAX_NOTIFY_RECIPIENTS).transform(unique).default([]),
  })
  .strict()
  .refine((action) => action.channel === 'webhook' || action.recipients.length > 0, { path: ['recipients'], message: 'recipients_required' })
  .refine((action) => action.channel !== 'webhook' || action.recipients.length === 0, { path: ['recipients'], message: 'recipients_not_used' });

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_template'), templateId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('create_task'),
      title: z.string().trim().min(1).max(TASK_TITLE_MAX),
      assignee: assigneeSchema.default(JOB_OWNER_ASSIGNEE),
      dueInDays: z.number().int().min(0).max(MAX_DUE_IN_DAYS).optional(),
    })
    .strict(),
  /** Adds one tag to the candidate (lowercase, like the profile stores them); a tag already there is left as it is. */
  z.object({ type: z.literal('add_tag'), tag: z.string().trim().toLowerCase().min(1).max(TAG_MAX) }).strict(),
  /**
   * Applications have no owner field: assigning one gives the person a follow-up task on it ("follow this application"),
   * at most one open per person and application.
   */
  z
    .object({
      type: z.literal('assign'),
      assignee: assigneeSchema.default(JOB_OWNER_ASSIGNEE),
      dueInDays: z.number().int().min(0).max(MAX_DUE_IN_DAYS).optional(),
    })
    .strict(),
  /** Asks the interviewers configured for the rule's stage; nobody already asked (open or answered) is asked again. */
  z.object({ type: z.literal('request_feedback') }).strict(),
  notifyActionSchema,
  /** A proposal to move the application to `toStageId`, for a person to confirm or dismiss. Never a move. */
  z.object({ type: z.literal('propose_move'), toStageId: z.string().min(1) }).strict(),
]);
export type AutomationAction = z.output<typeof automationActionSchema>;
export type AutomationActionInput = z.input<typeof automationActionSchema>;

/** The people an action names (task assignees, alert recipients): each must be a member when the rule is saved or copied. */
export function actionPeople(action: AutomationAction): readonly string[] {
  if (action.type === 'create_task' || action.type === 'assign') return [action.assignee];
  if (action.type === 'notify') return action.recipients;
  return [];
}

/** The title of the task an `assign` action creates, in the job's language. */
export const assignTaskTitle = (language: string): string => (language === 'it' ? 'Segui questa candidatura' : 'Follow this application');
