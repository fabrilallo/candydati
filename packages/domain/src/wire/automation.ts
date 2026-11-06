import { z } from 'zod';
import { automationActionSchema } from '../automation/automation.js';
import { automationConditionsSchema } from '../automation/conditions.js';
import { PACK_SKIP_REASONS, stageAnchorSchema } from '../automation/pack.js';
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
  /** The pack the rule was copied from, if any. */
  packId: z.string().nullable().default(null),
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

/** How many runs of a rule are listed by default, and at most. */
export const AUTOMATION_RUNS_DEFAULT = 20;
export const AUTOMATION_RUNS_MAX = 50;

/** One run of a rule: when, for which application and on which occurrence of its trigger. A log, never a score. */
export const automationRunSchema = z.object({
  id: z.string(),
  at: isoDate,
  /** The trigger of the occurrence that ran the rule (entry, stuck, deadline, reply, feedback). */
  trigger: z.enum(AUTOMATION_TRIGGERS),
  applicationId: z.string(),
  /** Null when the caller may not read candidates. */
  candidate: candidateRefSchema.nullable(),
});
export type AutomationRunDto = z.output<typeof automationRunSchema>;

/** A rule kept with a job template (`GET /job-templates/:id/automations`): copied to each job created from the template. */
export const templateAutomationRuleSchema = automationRuleSchema.omit({ jobId: true, packId: true }).extend({ templateId: z.string() });
export type TemplateAutomationRuleDto = z.output<typeof templateAutomationRuleSchema>;

/** An automation pack (`GET /automation-packs`): `ruleCount` rules, `templateIds` the job templates that use it. */
export const automationPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  ruleCount: z.number().int().min(0),
  templateIds: z.array(z.string()),
  createdBy: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type AutomationPackDto = z.output<typeof automationPackSchema>;

/** A rule of a pack: `stage` is a stage type or `received`; a proposed move's `toStageId` is a stage type too. */
export const automationPackRuleSchema = automationRuleSchema.omit({ jobId: true, stageId: true, packId: true }).extend({ packId: z.string(), stage: stageAnchorSchema });
export type AutomationPackRuleDto = z.output<typeof automationPackRuleSchema>;

/** `POST /jobs/:id/automation-packs`: what the attach created, updated and removed in the job, and what found no place. */
export const attachPackResultSchema = z.object({
  packId: z.string(),
  created: z.array(z.string()),
  /** Copies made before, brought up to date in place (they keep their id, and with it what they already did). */
  updated: z.array(z.string()),
  /** Copies made before whose pack rule or stage is gone. */
  removed: z.number().int().min(0),
  skipped: z.array(z.object({ ruleId: z.string(), reason: z.enum(PACK_SKIP_REASONS), stageId: z.string().nullable() })),
});
export type AttachPackResultDto = z.output<typeof attachPackResultSchema>;

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
