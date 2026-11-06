import { z } from 'zod';
import { automationActionSchema, type AutomationAction } from './actions.js';
import { automationConditionsSchema, type AutomationConditions } from './conditions.js';
import { automationTriggerSchema, STAGE_ENTERED, type AutomationTrigger } from './trigger.js';

export * from './actions.js';
export * from './conditions.js';
export * from './copy.js';
export * from './pack.js';
export * from './proposal.js';
export * from './trigger.js';

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
  /** The pack the rule was copied from (`null`: written in the job, or the pack was deleted). */
  readonly packId: string | null;
  /** The pack rule it is a copy of: attaching the pack again updates this copy in place instead of making a new one. */
  readonly packRuleId: string | null;
  /** The person whose decision the rule is: messages go out in their name. */
  readonly createdBy: string;
  readonly createdAt: Date;
}
