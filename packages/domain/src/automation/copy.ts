import { z } from 'zod';

/** Rules one copy may carry at most. */
export const MAX_COPIED_RULES = 50;

interface HolderIds {
  readonly jobId?: string | undefined;
  readonly packId?: string | undefined;
}

const oneHolder = (holder: HolderIds): boolean => (holder.jobId === undefined) !== (holder.packId === undefined);

/** Where copies go: a job, or an automation pack. */
export type AutomationHolder = { readonly kind: 'job'; readonly jobId: string } | { readonly kind: 'pack'; readonly packId: string };

/** The holder named by ids already validated to name exactly one. */
export const holderOf = (holder: HolderIds): AutomationHolder =>
  holder.jobId !== undefined ? { kind: 'job', jobId: holder.jobId } : { kind: 'pack', packId: holder.packId ?? '' };

const id = z.string().min(1);

/**
 * Copies rules of a job (`from.jobId`): some rules (`ruleIds`) or every rule of one stage (`stageId`), to one stage of a
 * job (`to.jobId` + `to.stageId`) or to an automation pack (`to.packId` + `to.stageId`, then a stage type or `received`).
 * The copies are the copying person's decision (`createdBy`).
 */
export const copyAutomationsInputSchema = z
  .object({
    from: z
      .object({ jobId: id, ruleIds: z.array(id).min(1).max(MAX_COPIED_RULES).optional(), stageId: id.optional() })
      .strict()
      .refine((from) => (from.ruleIds === undefined) !== (from.stageId === undefined), { message: 'rule_ids_or_stage_id' }),
    to: z.object({ jobId: id.optional(), packId: id.optional(), stageId: id }).strict().refine(oneHolder, { message: 'job_id_or_pack_id' }),
  })
  .strict();
export type CopyAutomationsInput = z.input<typeof copyAutomationsInputSchema>;
export type CopyAutomationsRequest = z.output<typeof copyAutomationsInputSchema>;
