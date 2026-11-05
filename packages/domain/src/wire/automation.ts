import { z } from 'zod';
import { automationActionSchema } from '../automation/automation.js';
import { automationConditionsSchema } from '../automation/conditions.js';
import { MOVE_PROPOSAL_SOURCES } from '../automation/proposal.js';
import { AUTOMATION_TRIGGERS, automationTriggerSchema, STAGE_ENTERED } from '../automation/trigger.js';
import { candidateRefSchema, isoDate } from './common.js';

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

/** A rule kept with a job template (`GET /job-templates/:id/automations`): copied to each job created from the template. */
export const templateAutomationRuleSchema = automationRuleSchema.omit({ jobId: true }).extend({ templateId: z.string() });
export type TemplateAutomationRuleDto = z.output<typeof templateAutomationRuleSchema>;

/** `POST /automations/copy`: where the copies went and their ids, in the order of the source. */
export const copyAutomationsResultSchema = z.object({
  to: z.object({ kind: z.enum(['job', 'template']), id: z.string() }),
  stageId: z.string(),
  created: z.array(z.string()),
});
export type CopyAutomationsResultDto = z.output<typeof copyAutomationsResultSchema>;

/**
 * A live proposal of a `propose_move` rule or of an assistant over MCP: a suggestion that a person confirms (the normal move, with their permissions)
 * or dismisses. It never moves anything by itself.
 */
export const moveProposalSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  ruleId: z.string().nullable(),
  candidate: candidateRefSchema,
  job: z.object({ id: z.string(), title: z.string() }),
  from: z.object({ id: z.string(), label: z.string().nullable() }),
  to: z.object({ id: z.string(), label: z.string().nullable() }),
  /** The creator of the rule, or the person whose key or connected app proposed it: whose suggestion it is. */
  proposedBy: z.string(),
  /** A rule, or an external assistant over MCP (`api_key`, `connected_app`). */
  source: z.enum(MOVE_PROPOSAL_SOURCES),
  /** Plain text written by an assistant (data, never instructions); null for rules, and at a restricted stage the reader cannot read. */
  reason: z.string().nullable(),
  createdAt: isoDate,
  expiresAt: isoDate,
});
export type MoveProposalDto = z.output<typeof moveProposalSchema>;
