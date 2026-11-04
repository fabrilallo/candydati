import type { StageConfigKind } from '@candydati/domain';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { can } from '../../authorization.js';
import type { ScorecardRepository, StageInterviewerRepository } from '../../feedback-ports.js';
import type { JobDeps } from '../../job-ports.js';
import type { JobTeamRepository } from '../../job-team-ports.js';
import { managesRestrictions } from './restricted-stages.js';

/** The repositories of what is tied to a stage by its id, besides the job itself. */
export interface StageConfigDeps extends Pick<JobDeps, 'automationRules' | 'newId' | 'now'> {
  readonly jobTeams: JobTeamRepository;
  readonly stageInterviewers: StageInterviewerRepository;
  readonly scorecards: ScorecardRepository;
}

export interface StageCopyTarget {
  readonly organizationId: string;
  readonly jobId: string;
  readonly from: string;
  readonly to: string;
}

export interface StageConfigOutcome {
  readonly copied: readonly StageConfigKind[];
  readonly skipped: readonly StageConfigKind[];
}

/** One kind of configuration: whether the source has any, whether the actor may manage it, and how to copy it. */
interface CopyStep {
  readonly kind: StageConfigKind;
  readonly present: boolean;
  readonly allowed: boolean;
  readonly copy: () => Promise<void>;
}

type StepOf = (deps: StageConfigDeps, actor: Actor, target: StageCopyTarget) => Promise<CopyStep>;

const interviewersStep: StepOf = async (deps, actor, { organizationId, jobId, from, to }) => {
  const source = await deps.stageInterviewers.listByStage(organizationId, jobId, from);
  return {
    kind: 'interviewers',
    present: source.length > 0,
    allowed: can(actor, 'feedback:manage'),
    copy: async () => {
      const all = await deps.stageInterviewers.listByJob(organizationId, jobId);
      const copies = source.map((row) => ({ ...row, id: deps.newId(), stageId: to, createdAt: deps.now() }));
      await deps.stageInterviewers.replaceForJob(organizationId, jobId, [...all, ...copies]);
    },
  };
};

/** Copies of the active criteria of the stage, after every criterion of the job, unused and written by the actor. */
const scorecardStep: StepOf = async (deps, actor, { organizationId, jobId, from, to }) => {
  const all = await deps.scorecards.listByJob(organizationId, jobId);
  const source = all.filter((criterion) => criterion.retiredAt === null && criterion.stageId === from);
  const next = all.reduce((max, criterion) => Math.max(max, criterion.position + 1), 0);
  return {
    kind: 'scorecard',
    present: source.length > 0,
    allowed: can(actor, 'feedback:manage'),
    copy: () =>
      deps.scorecards.create(
        source.map((criterion, index) => ({
          ...criterion, id: deps.newId(), stageId: to, position: next + index, createdBy: toActorUserId(actor), createdAt: deps.now(), firstUsedAt: null, retiredAt: null,
        })),
      ),
  };
};

/** A copied rule is the decision of who copied it: messages go out in their name, so `createdBy` is the actor. */
const automationsStep: StepOf = async (deps, actor, { organizationId, jobId, from, to }) => {
  const source = (await deps.automationRules.listByJob(organizationId, jobId)).filter((rule) => rule.stageId === from);
  return {
    kind: 'automations',
    present: source.length > 0,
    allowed: can(actor, 'automation:manage'),
    copy: async () => {
      for (const rule of source) {
        await deps.automationRules.create({ ...rule, id: deps.newId(), stageId: to, createdBy: toActorUserId(actor), createdAt: deps.now() });
      }
    },
  };
};

const restrictionStep: StepOf = async (deps, actor, { organizationId, jobId, from, to }) => {
  const restricted = (await deps.jobTeams.listRestrictedStages(organizationId, jobId)).some((stage) => stage.stageId === from);
  return {
    kind: 'restriction',
    present: restricted,
    allowed: restricted && (await managesRestrictions(deps, actor, jobId)),
    copy: async () => {
      await deps.jobTeams.restrictStage({ organizationId, jobId, stageId: to, restrictedBy: toActorUserId(actor), createdAt: deps.now() });
    },
  };
};

const STEPS: readonly StepOf[] = [interviewersStep, scorecardStep, automationsStep, restrictionStep];

/**
 * Copies to `to` what is tied to `from`, kind by kind, under each kind's own permission rule. What the actor may not
 * manage is skipped, not refused; a kind the source does not have is neither copied nor skipped.
 */
export async function copyStageConfig(deps: StageConfigDeps, actor: Actor, target: StageCopyTarget): Promise<StageConfigOutcome> {
  let outcome: StageConfigOutcome = { copied: [], skipped: [] };
  for (const stepOf of STEPS) {
    const step = await stepOf(deps, actor, target);
    if (!step.present) continue;
    if (step.allowed) await step.copy();
    outcome = step.allowed ? { ...outcome, copied: [...outcome.copied, step.kind] } : { ...outcome, skipped: [...outcome.skipped, step.kind] };
  }
  return outcome;
}
