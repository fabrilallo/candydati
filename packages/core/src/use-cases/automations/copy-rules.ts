import {
  copyAutomationsInputSchema,
  holderOf,
  MAX_PACK_RULES,
  pipelineStagesOf,
  RECEIVED_STAGE_ID,
  stageAnchorSchema,
  type AutomationAction,
  type AutomationConditions,
  type AutomationHolder,
  type AutomationTrigger,
  type CopyAutomationsRequest,
  type Job,
} from '@candydati/domain';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import type { AutomationRuleDeps } from '../../automation-ports.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineAutomationUseCase } from './define.js';
import { PACK_TARGET, requirePack } from './packs.js';
import { jobTarget, ruleIssues, type RuleTarget } from './rule-validation.js';

/** What a copy carries of a rule: everything but its holder, id, creator and creation time. */
export interface RuleShape {
  readonly id: string;
  readonly stageId: string;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationConditions;
  readonly action: AutomationAction;
  readonly enabled: boolean;
}

export interface CopyAutomationsResult {
  readonly to: AutomationHolder;
  readonly stageId: string;
  /** Ids of the new rules, in the order of the source. */
  readonly created: readonly string[];
}

/** The chosen rules of the source job, in its order: all of `ruleIds` (every one must exist there), or every rule of `stageId`. */
async function sourceRules(deps: AutomationRuleDeps, actor: Actor, from: CopyAutomationsRequest['from']): Promise<{ job: Job; rules: readonly RuleShape[] }> {
  const job = await requireJob(deps, actor.organizationId, from.jobId);
  const all = await deps.rules.listByJob(actor.organizationId, job.id);
  if (from.ruleIds === undefined) {
    const ofStage = all.filter((rule) => rule.stageId === from.stageId);
    if (ofStage.length === 0) throw new ValidationError([{ path: 'from.stageId', message: 'no_rules' }]);
    return { job, rules: ofStage };
  }
  const wanted = new Set(from.ruleIds);
  const chosen = all.filter((rule) => wanted.has(rule.id));
  if (chosen.length !== wanted.size) throw new NotFoundError('Automation rule not found.');
  return { job, rules: chosen };
}

/** In a pack a proposed move names a stage type: the type of the stage it points at in the source job. */
function toPackAction(job: Job, action: AutomationAction): AutomationAction {
  if (action.type !== 'propose_move') return action;
  const stage = pipelineStagesOf(job.content.process).find((candidate) => candidate.id === action.toStageId);
  return { ...action, toStageId: stage?.declared?.type ?? RECEIVED_STAGE_ID };
}

/** Every copy is checked against the target before anything is written: all or nothing. */
async function validateCopies(deps: AutomationRuleDeps, actor: Actor, target: RuleTarget, copies: readonly RuleShape[]): Promise<void> {
  const issues = [];
  for (const [index, copy] of copies.entries()) {
    const found = await ruleIssues(deps, actor.organizationId, target, copy);
    const backToReceived = target === PACK_TARGET && copy.action.type === 'propose_move' && copy.action.toStageId === RECEIVED_STAGE_ID;
    for (const issue of backToReceived ? [...found, { path: 'action.toStageId', message: 'unknown_stage' }] : found) issues.push({ path: `rules.${index}.${issue.path}`, message: issue.message });
  }
  if (issues.length > 0) throw new ValidationError(issues);
}

async function writeCopy(deps: AutomationRuleDeps, actor: Actor, to: AutomationHolder, copy: RuleShape): Promise<string> {
  const { stageId, trigger, conditions, action, enabled } = copy;
  const base = { id: deps.newId(), organizationId: actor.organizationId, trigger, conditions, action, enabled, createdBy: toActorUserId(actor), createdAt: deps.now() };
  if (to.kind === 'job') return (await deps.rules.create({ ...base, jobId: to.jobId, stageId, packId: null, packRuleId: null })).id;
  return (await deps.automationPacks.createRule({ ...base, packId: to.packId, stage: stageAnchorSchema.parse(stageId) })).id;
}

/** Where the copies go, and the copies as that target names them. */
async function prepare(deps: AutomationRuleDeps, actor: Actor, input: CopyAutomationsRequest, job: Job, rules: readonly RuleShape[]) {
  const to = holderOf(input.to);
  const { stageId } = input.to;
  if (to.kind === 'job') {
    if (to.jobId === job.id && rules.some((rule) => rule.stageId === stageId)) throw new ValidationError([{ path: 'to.stageId', message: 'same_stage' }]);
    return { to, target: jobTarget(await requireJob(deps, actor.organizationId, to.jobId)), copies: rules.map((rule) => ({ ...rule, stageId })) };
  }
  const pack = await requirePack(deps, actor.organizationId, to.packId);
  if ((await deps.automationPacks.listRules(actor.organizationId, pack.id)).length + rules.length > MAX_PACK_RULES) {
    throw new ConflictError(`An automation pack holds at most ${MAX_PACK_RULES} rules.`);
  }
  return { to, target: PACK_TARGET, copies: rules.map((rule) => ({ ...rule, stageId, action: toPackAction(job, rule.action) })) };
}

/**
 * Copies rules of a job (some of them, or every rule of a stage) to one stage of the same job or another job, or into an
 * automation pack on a stage type. Each copy is validated against the target (the stage exists, templates resolve, the
 * people named are members, a proposed move points at one of its stages) and becomes the copying person's decision:
 * they are its `createdBy`, so its messages go out in their name.
 */
export const copyAutomations = defineAutomationUseCase({
  name: 'copyAutomations',
  input: copyAutomationsInputSchema,
  permission: 'automation:manage',
  audit: {
    action: 'automation.copied',
    target: (_input, result: CopyAutomationsResult) => (result.to.kind === 'job' ? { type: 'job', id: result.to.jobId } : { type: 'automation_pack', id: result.to.packId }),
    metadata: (input, result: CopyAutomationsResult) => ({ from: { kind: 'job', jobId: input.from.jobId }, stageId: result.stageId, count: result.created.length, ruleIds: result.created }),
  },
  handler: async ({ deps, actor, input }): Promise<CopyAutomationsResult> => {
    const { job, rules } = await sourceRules(deps, actor, input.from);
    const { to, target, copies } = await prepare(deps, actor, input, job, rules);
    await validateCopies(deps, actor, target, copies);
    const created: string[] = [];
    for (const copy of copies) created.push(await writeCopy(deps, actor, to, copy));
    return { to, stageId: input.to.stageId, created };
  },
});
