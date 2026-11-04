import { z } from 'zod';
import type { AutomationAction } from './actions.js';
import type { AutomationConditions } from './conditions.js';
import type { AutomationTrigger } from './trigger.js';

/** Rules one copy may carry at most. */
export const MAX_COPIED_RULES = 50;

/**
 * A rule kept with a job template: a job created from the template gets a copy of it, made by whoever creates the job.
 * Stage ids are the template's, which a job created from it keeps.
 */
export interface TemplateAutomationRule {
  readonly id: string;
  readonly organizationId: string;
  readonly templateId: string;
  readonly stageId: string;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationConditions;
  readonly action: AutomationAction;
  readonly enabled: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

interface HolderIds {
  readonly jobId?: string | undefined;
  readonly templateId?: string | undefined;
}

const oneHolder = (holder: HolderIds): boolean => (holder.jobId === undefined) !== (holder.templateId === undefined);

/** A job or a job template. */
export type AutomationHolder = { readonly kind: 'job'; readonly jobId: string } | { readonly kind: 'template'; readonly templateId: string };

/** The holder named by ids already validated to name exactly one. */
export const holderOf = (holder: HolderIds): AutomationHolder =>
  holder.jobId !== undefined ? { kind: 'job', jobId: holder.jobId } : { kind: 'template', templateId: holder.templateId ?? '' };

const id = z.string().min(1);

/**
 * Copies rules from a job or a job template (`from.jobId` or `from.templateId`) to one stage of a job or a template. The
 * source is either some rules (`ruleIds`) or every rule of one stage (`stageId`). The copies are the copying person's
 * decision (`createdBy`).
 */
export const copyAutomationsInputSchema = z
  .object({
    from: z
      .object({ jobId: id.optional(), templateId: id.optional(), ruleIds: z.array(id).min(1).max(MAX_COPIED_RULES).optional(), stageId: id.optional() })
      .strict()
      .refine(oneHolder, { message: 'job_id_or_template_id' })
      .refine((from) => (from.ruleIds === undefined) !== (from.stageId === undefined), { message: 'rule_ids_or_stage_id' }),
    to: z.object({ jobId: id.optional(), templateId: id.optional(), stageId: id }).strict().refine(oneHolder, { message: 'job_id_or_template_id' }),
  })
  .strict();
export type CopyAutomationsInput = z.input<typeof copyAutomationsInputSchema>;
export type CopyAutomationsRequest = z.output<typeof copyAutomationsInputSchema>;
