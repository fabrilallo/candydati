import { z } from 'zod';
import { automationActionSchema } from '../automation/automation.js';
import { isoDate } from './common.js';

/** A rule of a job (`GET /jobs/:id/automations`); `createdBy` is a user id. */
export const automationRuleSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  action: automationActionSchema,
  enabled: z.boolean(),
  createdBy: z.string(),
  createdAt: isoDate,
});
export type AutomationRuleDto = z.output<typeof automationRuleSchema>;
