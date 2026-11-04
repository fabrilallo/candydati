import { MAX_STAGES, STAGE_ID_PATTERN, type Job, type SelectionStage } from '@candydati/domain';
import { z } from 'zod';
import { ValidationError } from '../../errors.js';
import type { JobDeps } from '../../job-ports.js';
import type { JobTeamRepository } from '../../job-team-ports.js';
import type { MemberDirectory } from '../../automation-ports.js';
import { defineUseCase } from '../../use-case.js';
import { requireJob } from './shared.js';
import { copyStageConfig, type StageConfigDeps, type StageConfigOutcome } from './stage-config-copy.js';
import { updateJob } from './update-job.js';

export interface DuplicateStageDeps extends JobDeps, StageConfigDeps {
  readonly jobTeams: JobTeamRepository;
  readonly members: MemberDirectory;
}

export interface DuplicateStageResult extends StageConfigOutcome {
  readonly job: Job;
  /** The id of the new stage. */
  readonly stageId: string;
}

const inputSchema = z.strictObject({ jobId: z.string().min(1), stageId: z.string().regex(STAGE_ID_PATTERN) });

/** A legacy stage saved without an id is `stage-<index>` in the pipeline: pinning it keeps its candidates where they are. */
const pinIds = (process: readonly SelectionStage[]): readonly (SelectionStage & { readonly id: string })[] =>
  process.map((stage, index) => ({ ...stage, id: stage.id ?? `stage-${index}` }));

/** The process with a copy of stage `index` right after it; the copy has no id, so the save gives it a fresh one. */
function withCopyAfter(process: readonly SelectionStage[], index: number): readonly SelectionStage[] {
  const { id: _id, ...fields } = process[index]!;
  return [...process.slice(0, index + 1), fields, ...process.slice(index + 1)];
}

/**
 * Copies a stage of the job right after it (same type, duration, conductor, title and note, a new id), saved through
 * `updateJob` with all its rules, then copies what is tied to the source stage that the actor may manage: interviewers,
 * the stage's criteria, automation rules (as the actor's own decision) and the restriction. One transaction: all or nothing.
 */
export const duplicateStage = defineUseCase<DuplicateStageDeps, typeof inputSchema, DuplicateStageResult>({
  name: 'duplicateStage',
  input: inputSchema,
  permission: 'job:update',
  audit: {
    action: 'job.stage_duplicated',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input, result) => ({ sourceStageId: input.stageId, stageId: result.stageId, copied: result.copied, skipped: result.skipped }),
  },
  handler: async ({ deps, actor, input }): Promise<DuplicateStageResult> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const process = pinIds(job.content.process);
    const index = process.findIndex((stage) => stage.id === input.stageId);
    if (index < 0) throw new ValidationError([{ path: 'stageId', message: 'unknown_stage' }]);
    if (process.length >= MAX_STAGES) throw new ValidationError([{ path: 'process', message: 'too_many_stages' }]);
    const saved = await updateJob(deps, actor, { jobId: job.id, content: { ...job.content, process: withCopyAfter(process, index) } });
    const stageId = saved.content.process[index + 1]?.id;
    if (stageId === undefined) throw new Error('The saved process has no id for the new stage.');
    const outcome = await copyStageConfig(deps, actor, { organizationId: actor.organizationId, jobId: job.id, from: input.stageId, to: stageId });
    return { job: saved, stageId, ...outcome };
  },
});
