import { z } from 'zod';
import { TASK_TITLE_MAX } from '../task/task.js';
import { automationConditionsSchema, type AutomationConditions } from './conditions.js';
import { automationTriggerSchema, STAGE_ENTERED, type AutomationTrigger } from './trigger.js';

export * from './conditions.js';
export * from './trigger.js';

/**
 * What a rule may do when its trigger fires (`trigger.ts`). Deliberately only these two: there is no `move` and no
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

/** Who a rule acts for: its stage, its trigger and its conditions. Also the body of a preview. */
export const automationMatchSchema = z.object({
  stageId: z.string().min(1),
  /** Absent: `stage_entered`, the only trigger before triggers could be chosen. */
  trigger: automationTriggerSchema.default(STAGE_ENTERED),
  conditions: automationConditionsSchema.default({}),
});
export type AutomationMatchInput = z.input<typeof automationMatchSchema>;
export type AutomationMatch = z.output<typeof automationMatchSchema>;

export const automationRuleInputSchema = automationMatchSchema.extend({
  action: automationActionSchema,
  enabled: z.boolean().default(true),
});
export type AutomationRuleInput = z.input<typeof automationRuleInputSchema>;

export interface AutomationRule {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly trigger: AutomationTrigger;
  /** All must hold; empty: every application of the stage. */
  readonly conditions: AutomationConditions;
  readonly action: AutomationAction;
  readonly enabled: boolean;
  /** The person whose decision the rule is: messages go out in their name. */
  readonly createdBy: string;
  readonly createdAt: Date;
}
