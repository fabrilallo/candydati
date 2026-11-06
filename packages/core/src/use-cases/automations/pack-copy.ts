import { resolvePackRules, type AutomationPack, type AutomationRule, type Job, type PlacedPackRule, type SkippedPackRule } from '@candydati/domain';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import type { AutomationRuleRepository } from '../../automation-ports.js';
import type { PackSources } from '../../pack-ports.js';
import { jobTarget, ruleIssues } from './rule-validation.js';

export interface AttachPackResult {
  readonly jobId: string;
  readonly packId: string;
  /** Rules created in the job, in the order of the pack. */
  readonly created: readonly string[];
  /** Copies made before, brought up to date in place: same id, so what they already did is not done again. */
  readonly updated: readonly string[];
  /** Copies made before whose pack rule or stage is gone. */
  readonly removed: number;
  readonly skipped: readonly SkippedPackRule[];
}

export interface PackCopyDeps extends PackSources {
  readonly rules: AutomationRuleRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}

const keyOf = (packRuleId: string | null, stageId: string): string => `${packRuleId ?? ''}\u0000${stageId}`;

/** The placements the job can take. A rule is copied whole or not at all: one placement naming a person who left skips them all. */
async function validPlacements(deps: PackCopyDeps, job: Job, placed: readonly PlacedPackRule[]): Promise<{ valid: readonly PlacedPackRule[]; invalid: readonly SkippedPackRule[] }> {
  const target = jobTarget(job);
  const invalidIds = new Set<string>();
  for (const placement of placed) {
    const issues = await ruleIssues(deps, job.organizationId, target, { stageId: placement.stageId, action: placement.action });
    if (issues.length > 0) invalidIds.add(placement.rule.id);
  }
  return {
    valid: placed.filter((p) => !invalidIds.has(p.rule.id)),
    invalid: [...invalidIds].map((ruleId): SkippedPackRule => ({ ruleId, reason: 'invalid', stageId: null })),
  };
}

/**
 * Brings the job's copies of a pack in line with it (`resolvePackRules`). A copy already made for the same pack rule and
 * stage is updated in place and keeps its id, so time-based triggers do not fire again for what it already did; new
 * placements are created; copies whose pack rule or stage is gone are removed. The job's own rules are left alone. The
 * copies are the actor's decision (`createdBy`). The job must be locked by the caller, so two attaches do not interleave.
 */
export async function syncPackToJob(deps: PackCopyDeps, actor: Actor, pack: AutomationPack, job: Job): Promise<AttachPackResult> {
  const { organizationId } = job;
  const { placed, skipped } = resolvePackRules(await deps.automationPacks.listRules(organizationId, pack.id), job.content.process);
  const { valid, invalid } = await validPlacements(deps, job, placed);
  const existing = new Map((await deps.rules.listByJob(organizationId, job.id)).filter((r) => r.packId === pack.id).map((r) => [keyOf(r.packRuleId, r.stageId), r]));
  const createdBy = toActorUserId(actor);
  const created: string[] = [];
  const updated: string[] = [];
  for (const { rule, stageId, action } of valid) {
    const fields = { trigger: rule.trigger, conditions: rule.conditions, action, enabled: rule.enabled, createdBy };
    const previous = existing.get(keyOf(rule.id, stageId));
    if (previous) {
      existing.delete(keyOf(rule.id, stageId));
      updated.push((await deps.rules.save({ ...previous, ...fields })).id);
    } else {
      const copy: AutomationRule = { id: deps.newId(), organizationId, jobId: job.id, stageId, packId: pack.id, packRuleId: rule.id, createdAt: deps.now(), ...fields };
      created.push((await deps.rules.create(copy)).id);
    }
  }
  for (const stale of existing.values()) await deps.rules.delete(organizationId, stale.id);
  return { jobId: job.id, packId: pack.id, created, updated, removed: existing.size, skipped: [...skipped, ...invalid] };
}
