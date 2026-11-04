import { pipelineStagesOf, readsEveryRestrictedStage } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { can } from '../../authorization.js';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { defineJobTeamUseCase, type JobTeamDeps } from './job-team.js';
import { requireJob } from './shared.js';

/** The restricted stages of a job (PRODUCT.md §6.2) and whether the person asking may change them. */
export interface RestrictedStagesView {
  readonly jobId: string;
  readonly stageIds: readonly string[];
  readonly canManage: boolean;
}

export interface StageRestrictionResult extends RestrictedStagesView {
  /** False when the stage already was as asked: nothing was written or audited. */
  readonly changed: boolean;
}

/** Owners and admins, or the person who is the hiring manager on the job's team; always with the permission. */
async function managesRestrictions(deps: JobTeamDeps, actor: Actor, jobId: string): Promise<boolean> {
  if (!can(actor, 'restricted_stage:manage')) return false;
  if (readsEveryRestrictedStage(actor.role)) return true;
  const person = actor.type === 'user' ? actor.id : actor.onBehalfOfUserId;
  const team = await deps.jobTeams.list(actor.organizationId, jobId);
  return team.some((member) => member.userId === person && member.role === 'hiring_manager');
}

async function viewOf(deps: JobTeamDeps, actor: Actor, jobId: string): Promise<RestrictedStagesView> {
  const stages = await deps.jobTeams.listRestrictedStages(actor.organizationId, jobId);
  return { jobId, stageIds: stages.map((stage) => stage.stageId).toSorted(), canManage: await managesRestrictions(deps, actor, jobId) };
}

/** Which stages of a job are restricted: everyone on the team may know it, so nobody writes there by mistake. */
export const getRestrictedStages = defineJobTeamUseCase({
  name: 'getRestrictedStages',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job_team:read',
  audit: { skip: 'read of configuration, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<RestrictedStagesView> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    return viewOf(deps, actor, job.id);
  },
});

const setInput = z.strictObject({ jobId: z.string().min(1), stageId: z.string().min(1).max(100), restricted: z.boolean() });

/**
 * Marks a declared stage of the job restricted, or removes the mark. Who reads what is an access decision: owners, admins
 * and the job's hiring manager only, never an API key or the assistant. Audited only when something changed.
 */
export const setStageRestriction = defineJobTeamUseCase({
  name: 'setStageRestriction',
  input: setInput,
  permission: 'restricted_stage:manage',
  audit: {
    action: (input, result: StageRestrictionResult) => {
      if (!result.changed) return null;
      return input.restricted ? 'job.stage_restricted' : 'job.stage_unrestricted';
    },
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input) => ({ stageId: input.stageId }),
  },
  handler: async ({ deps, actor, input }): Promise<StageRestrictionResult> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    if (!(await managesRestrictions(deps, actor, job.id))) throw new ForbiddenError();
    const declared = pipelineStagesOf(job.content.process).some((stage) => stage.declared !== null && stage.id === input.stageId);
    if (!declared) throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    const changed = input.restricted
      ? await deps.jobTeams.restrictStage({ organizationId: actor.organizationId, jobId: job.id, stageId: input.stageId, restrictedBy: toActorUserId(actor), createdAt: deps.now() })
      : await deps.jobTeams.unrestrictStage(actor.organizationId, job.id, input.stageId);
    return { ...(await viewOf(deps, actor, job.id)), changed };
  },
});
