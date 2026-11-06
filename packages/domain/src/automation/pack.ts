import { z } from 'zod';
import { pipelineStagesOf, RECEIVED_STAGE_ID } from '../candidate/application.js';
import type { SelectionStage } from '../job/content.js';
import { STAGE_TYPES } from '../job/taxonomy.js';
import { automationActionSchema, type AutomationAction } from './actions.js';
import { automationConditionsSchema, type AutomationConditions } from './conditions.js';
import { automationTriggerSchema, STAGE_ENTERED, type AutomationTrigger } from './trigger.js';

/**
 * Where a pack rule acts: the received stage or every stage of one type. A pack serves jobs with different processes,
 * so it never names a stage id; the anchors become stage ids when the pack is attached to a job.
 */
export const STAGE_ANCHORS = [RECEIVED_STAGE_ID, ...STAGE_TYPES] as const;
export type StageAnchor = (typeof STAGE_ANCHORS)[number];
export const stageAnchorSchema = z.enum(STAGE_ANCHORS);

export const PACK_NAME_MAX = 80;
export const PACK_DESCRIPTION_MAX = 500;
/** Rules one pack may hold at most. */
export const MAX_PACK_RULES = 50;

export const automationPackInputSchema = z.object({
  name: z.string().trim().min(1).max(PACK_NAME_MAX),
  description: z.string().trim().max(PACK_DESCRIPTION_MAX).default(''),
});
export type AutomationPackInput = z.input<typeof automationPackInputSchema>;

/** A set of rules kept by the organization, attached (copied) to jobs and referenced by job templates. */
export interface AutomationPack {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A pack rule: like a job rule, with `stage` an anchor. In a `propose_move` action `toStageId` holds an anchor too, a
 * stage type other than the rule's own: on attach it becomes the first stage of that type after the rule's stage.
 */
export const automationPackRuleInputSchema = z
  .object({
    stage: stageAnchorSchema,
    trigger: automationTriggerSchema.default(STAGE_ENTERED),
    conditions: automationConditionsSchema.default({}),
    action: automationActionSchema,
    enabled: z.boolean().default(true),
  })
  // `received` is always the first stage: no move can go back there.
  .refine((rule) => rule.action.type !== 'propose_move' || (rule.action.toStageId !== RECEIVED_STAGE_ID && stageAnchorSchema.safeParse(rule.action.toStageId).success), {
    path: ['action', 'toStageId'],
    message: 'unknown_stage',
  })
  .refine((rule) => rule.action.type !== 'propose_move' || rule.action.toStageId !== rule.stage, { path: ['action', 'toStageId'], message: 'same_stage' });
export type AutomationPackRuleInput = z.input<typeof automationPackRuleInputSchema>;

export interface AutomationPackRule {
  readonly id: string;
  readonly organizationId: string;
  readonly packId: string;
  readonly stage: StageAnchor;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationConditions;
  readonly action: AutomationAction;
  readonly enabled: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** A pack rule placed on one stage of a job, with its action's stage resolved. */
export interface PlacedPackRule {
  readonly rule: AutomationPackRule;
  readonly stageId: string;
  readonly action: AutomationAction;
}

/** `invalid`: the copy would name what the job cannot take (an email template, a person who left). */
export const PACK_SKIP_REASONS = ['no_stage', 'no_target_stage', 'invalid'] as const;
export interface SkippedPackRule {
  readonly ruleId: string;
  readonly reason: (typeof PACK_SKIP_REASONS)[number];
  /** The job stage left without a copy; null when the rule found no stage at all, or was skipped whole. */
  readonly stageId: string | null;
}

interface Indexed {
  readonly id: string;
  readonly anchor: StageAnchor;
  readonly index: number;
}

const indexed = (process: readonly SelectionStage[]): readonly Indexed[] =>
  pipelineStagesOf(process).map((stage, index) => ({ id: stage.id, anchor: stage.declared?.type ?? RECEIVED_STAGE_ID, index }));

type Placement = { readonly placed: PlacedPackRule } | { readonly skipped: SkippedPackRule };

function placeOn(rule: AutomationPackRule, stage: Indexed, stages: readonly Indexed[]): Placement {
  const { action } = rule;
  if (action.type !== 'propose_move') return { placed: { rule, stageId: stage.id, action } };
  const target = stages.find((candidate) => candidate.index > stage.index && candidate.anchor === action.toStageId);
  return target ? { placed: { rule, stageId: stage.id, action: { ...action, toStageId: target.id } } } : { skipped: { ruleId: rule.id, reason: 'no_target_stage', stageId: stage.id } };
}

function place(rule: AutomationPackRule, stages: readonly Indexed[]): readonly Placement[] {
  const matching = stages.filter((stage) => stage.anchor === rule.stage);
  if (matching.length === 0) return [{ skipped: { ruleId: rule.id, reason: 'no_stage', stageId: null } }];
  return matching.map((stage) => placeOn(rule, stage, stages));
}

/**
 * Where each pack rule lands in a job with this process: on every stage of its type (`received` on the received stage).
 * Skipped: a rule whose type the job lacks (`no_stage`), and each stage where a proposed move finds no stage of the
 * target type after it (`no_target_stage`, with that stage).
 */
export function resolvePackRules(
  rules: readonly AutomationPackRule[],
  process: readonly SelectionStage[],
): { readonly placed: readonly PlacedPackRule[]; readonly skipped: readonly SkippedPackRule[] } {
  const stages = indexed(process);
  const placements = rules.flatMap((rule) => place(rule, stages));
  return {
    placed: placements.flatMap((p) => ('placed' in p ? [p.placed] : [])),
    skipped: placements.flatMap((p) => ('skipped' in p ? [p.skipped] : [])),
  };
}
