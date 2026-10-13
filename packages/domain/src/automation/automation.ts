import { z } from 'zod';
import { TASK_TITLE_MAX } from '../task/task.js';

/**
 * What a rule may do when an application ENTERS a stage. Deliberately only these two: there is no `move` and no
 * `decide` action, because nothing decides about a candidate automatically (PRODUCT.md §2, principle 4).
 */
export const AUTOMATION_ACTIONS = ['send_template', 'create_task'] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];

/** The assignee of an automatic task: the owner of the job, or a user id. */
export const JOB_OWNER_ASSIGNEE = 'job_owner';
export const MAX_DUE_IN_DAYS = 90;

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_template'), templateId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('create_task'),
      title: z.string().trim().min(1).max(TASK_TITLE_MAX),
      assignee: z.string().min(1).default(JOB_OWNER_ASSIGNEE),
      dueInDays: z.number().int().min(0).max(MAX_DUE_IN_DAYS).optional(),
    })
    .strict(),
]);
export type AutomationAction = z.output<typeof automationActionSchema>;
export type AutomationActionInput = z.input<typeof automationActionSchema>;

export const automationRuleInputSchema = z.object({
  stageId: z.string().min(1),
  action: automationActionSchema,
  enabled: z.boolean().default(true),
});
export type AutomationRuleInput = z.input<typeof automationRuleInputSchema>;

export interface AutomationRule {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly action: AutomationAction;
  readonly enabled: boolean;
  /** The person whose decision the rule is: messages go out in their name. */
  readonly createdBy: string;
  readonly createdAt: Date;
}
