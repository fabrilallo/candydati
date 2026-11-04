import { pipelineStagesOf, scorecardCriteriaInputSchema, type Job, type ScorecardCriterion, type ScorecardCriterionInput } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, ValidationError } from '../../errors.js';
import type { FeedbackDeps } from '../../feedback-ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineFeedbackUseCase } from './define.js';

/** One active criterion as the editor and the interview kit read it. `locked`: a feedback used it, so its words are fixed. */
export interface ScorecardCriterionView {
  readonly id: string;
  readonly label: string;
  readonly stageId: string | null;
  readonly position: number;
  readonly locked: boolean;
}

export interface JobScorecardView {
  readonly jobId: string;
  readonly criteria: readonly ScorecardCriterionView[];
}

export interface ScorecardChanges {
  readonly created: number;
  readonly changed: number;
  readonly retired: number;
  readonly removed: number;
}

const toView = (criterion: ScorecardCriterion): ScorecardCriterionView => ({
  id: criterion.id,
  label: criterion.label,
  stageId: criterion.stageId,
  position: criterion.position,
  locked: criterion.firstUsedAt !== null,
});

export async function loadScorecard(deps: Pick<FeedbackDeps, 'scorecards'>, organizationId: string, jobId: string): Promise<JobScorecardView> {
  const criteria = await deps.scorecards.listByJob(organizationId, jobId);
  return { jobId, criteria: criteria.filter((criterion) => criterion.retiredAt === null).map(toView) };
}

/** The evaluation criteria of a job, declared before the interviews (PRODUCT.md §3.1). No weight, no score. */
export const getJobScorecard = defineFeedbackUseCase({
  name: 'getJobScorecard',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'feedback:read',
  audit: { skip: 'read of configuration, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<JobScorecardView> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    return loadScorecard(deps, actor.organizationId, job.id);
  },
});

type Issue = { path: string; message: string };

function validate(job: Job, active: readonly ScorecardCriterion[], criteria: readonly ScorecardCriterionInput[]): readonly Issue[] {
  const declared = new Set(pipelineStagesOf(job.content.process).filter((stage) => stage.declared !== null).map((stage) => stage.id));
  const seen = new Set<string>();
  return criteria.flatMap((criterion, index): Issue[] => {
    const issues: Issue[] = [];
    const existing = criterion.id === undefined ? undefined : active.find((c) => c.id === criterion.id);
    if (criterion.id !== undefined && !existing) issues.push({ path: `criteria.${index}.id`, message: 'unknown_criterion' });
    if (criterion.stageId !== null && !declared.has(criterion.stageId)) issues.push({ path: `criteria.${index}.stageId`, message: 'unknown_stage' });
    const identity = `${criterion.stageId ?? ''}\u0000${criterion.label.toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(identity)) issues.push({ path: `criteria.${index}.label`, message: 'duplicate_criterion' });
    seen.add(identity);
    if (existing && existing.firstUsedAt !== null && (existing.label !== criterion.label || existing.stageId !== criterion.stageId)) {
      issues.push({ path: `criteria.${index}.label`, message: 'criterion_in_use' });
    }
    return issues;
  });
}

async function apply(deps: FeedbackDeps, actor: Actor, job: Job, active: readonly ScorecardCriterion[], criteria: readonly ScorecardCriterionInput[]): Promise<ScorecardChanges> {
  const { organizationId } = actor;
  const now = deps.now();
  const kept = new Set(criteria.flatMap((criterion) => (criterion.id === undefined ? [] : [criterion.id])));
  const dropped = active.filter((criterion) => !kept.has(criterion.id));
  for (const criterion of dropped.filter((c) => c.firstUsedAt !== null)) await deps.scorecards.retire(organizationId, criterion.id, now);
  for (const criterion of dropped.filter((c) => c.firstUsedAt === null)) {
    if (!(await deps.scorecards.removeUnused(organizationId, criterion.id))) await deps.scorecards.retire(organizationId, criterion.id, now);
  }
  let changed = 0;
  const created: ScorecardCriterion[] = [];
  for (const [position, criterion] of criteria.entries()) {
    const existing = active.find((c) => c.id === criterion.id);
    if (!existing) {
      created.push({ id: deps.newId(), organizationId, jobId: job.id, stageId: criterion.stageId, label: criterion.label, position, createdBy: toActorUserId(actor), createdAt: now, firstUsedAt: null, retiredAt: null });
    } else if (existing.label !== criterion.label || existing.stageId !== criterion.stageId) {
      // A feedback may have used it since we read it: then its words are fixed, and the person sees why.
      if (!(await deps.scorecards.updateUnused(organizationId, existing.id, { label: criterion.label, stageId: criterion.stageId, position }))) throw new ConflictError('criterion_in_use');
      changed += 1;
    } else if (existing.position !== position) await deps.scorecards.move(organizationId, existing.id, position);
  }
  await deps.scorecards.create(created);
  return { created: created.length, changed, retired: dropped.filter((c) => c.firstUsedAt !== null).length, removed: dropped.filter((c) => c.firstUsedAt === null).length };
}

/**
 * The list becomes the active scorecard of the job, in order. New entries are created; an unused criterion can change its
 * words or stage, or be deleted; a criterion a feedback used keeps its words and stage (`criterion_in_use`) and, when left
 * out, is retired so past feedback still reads as written.
 */
export const setJobScorecard = defineFeedbackUseCase({
  name: 'setJobScorecard',
  input: z.strictObject({ jobId: z.string().min(1), criteria: scorecardCriteriaInputSchema }),
  permission: 'feedback:manage',
  audit: {
    action: 'job.scorecard_updated',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result: JobScorecardView & { readonly changes: ScorecardChanges }) => ({ ...result.changes }),
  },
  handler: async ({ deps, actor, input }) => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const active = (await deps.scorecards.listByJob(actor.organizationId, job.id)).filter((criterion) => criterion.retiredAt === null);
    const issues = validate(job, active, input.criteria);
    if (issues.length > 0) throw new ValidationError(issues);
    const changes = await apply(deps, actor, job, active, input.criteria);
    return { ...(await loadScorecard(deps, actor.organizationId, job.id)), changes };
  },
});
