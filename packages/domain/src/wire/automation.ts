import { z } from 'zod';
import { automationActionSchema } from '../automation/automation.js';
import { automationConditionsSchema } from '../automation/conditions.js';
import { AUTOMATION_TRIGGERS, automationTriggerSchema, STAGE_ENTERED } from '../automation/trigger.js';
import { isoDate } from './common.js';

/** A rule of a job (`GET /jobs/:id/automations`); `createdBy` is a user id. */
export const automationRuleSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  trigger: automationTriggerSchema.default(STAGE_ENTERED),
  conditions: automationConditionsSchema.default({}),
  action: automationActionSchema,
  enabled: z.boolean(),
  createdBy: z.string(),
  createdAt: isoDate,
});
export type AutomationRuleDto = z.output<typeof automationRuleSchema>;

/** At most this many people are named in a preview; the counts are always complete. */
export const AUTOMATION_PREVIEW_LIMIT = 50;

/** One open application of the stage that meets the conditions. Names only: what the pipeline already shows. */
export const automationPreviewItemSchema = z.object({
  applicationId: z.string(),
  candidateId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Time-based triggers: the rule would act for this application at the next scan. Null for event triggers. */
  firesNow: z.boolean().nullable(),
});

/**
 * `POST /jobs/:id/automations/preview`: who a rule being edited would act for, now. Read-only. `items` is null when the
 * caller may not read candidates (an API key limited to `automation:manage`): the counts alone are shown.
 */
export const automationPreviewSchema = z.object({
  trigger: z.enum(AUTOMATION_TRIGGERS),
  /** Open applications in the stage that meet every condition. */
  matching: z.number().int().min(0),
  /** Of those, how many the trigger would fire for now (time-based triggers); null for event triggers. */
  firingNow: z.number().int().min(0).nullable(),
  /** By date of application, oldest first, at most `AUTOMATION_PREVIEW_LIMIT`. */
  items: z.array(automationPreviewItemSchema).nullable(),
});
export type AutomationPreviewDto = z.output<typeof automationPreviewSchema>;
