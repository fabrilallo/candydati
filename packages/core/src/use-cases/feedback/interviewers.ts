import { INTERVIEWERS_PER_STAGE_MAX, interviewerInputSchema, pipelineStagesOf, type StageInterviewer } from '@candydati/domain';
import { z } from 'zod';
import { ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { defineFeedbackUseCase } from './define.js';

const stageSchema = z.object({
  stageId: z.string().min(1),
  interviewers: z.array(interviewerInputSchema).max(INTERVIEWERS_PER_STAGE_MAX),
});

export interface StageInterviewersView {
  readonly stageId: string;
  readonly interviewers: readonly StageInterviewer[];
}

const group = (interviewers: readonly StageInterviewer[]): readonly StageInterviewersView[] => {
  const stageIds = [...new Set(interviewers.map((i) => i.stageId))];
  return stageIds.map((stageId) => ({ stageId, interviewers: interviewers.filter((i) => i.stageId === stageId) }));
};

export const getJobInterviewers = defineFeedbackUseCase({
  name: 'getJobInterviewers',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'feedback:read',
  audit: { skip: 'read of configuration, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<readonly StageInterviewersView[]> => {
    await requireJob(deps, actor.organizationId, input.jobId);
    return group(await deps.stageInterviewers.listByJob(actor.organizationId, input.jobId));
  },
});

/**
 * Sets who is asked for feedback, per stage of the job; the list replaces the whole configuration. Only stages the job
 * declares (not `received`), at most 5 people each, members must belong to the organization, one entry per person.
 */
export const setJobInterviewers = defineFeedbackUseCase({
  name: 'setJobInterviewers',
  input: z.object({ jobId: z.string().min(1), stages: z.array(stageSchema).max(20) }),
  permission: 'feedback:manage',
  audit: {
    action: 'job.interviewers_updated',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result: readonly StageInterviewersView[]) => ({ stages: result.length, people: result.reduce((n, s) => n + s.interviewers.length, 0) }),
  },
  handler: async ({ deps, actor, input }): Promise<readonly StageInterviewersView[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const declared = new Set(pipelineStagesOf(job.content.process).filter((stage) => stage.declared !== null).map((stage) => stage.id));
    const members = await deps.members.list(actor.organizationId);
    const now = deps.now();
    const issues: { path: string; message: string }[] = [];
    const rows: StageInterviewer[] = [];
    const seenStages = new Set<string>();
    input.stages.forEach((stage, index) => {
      if (seenStages.has(stage.stageId)) issues.push({ path: `stages.${index}.stageId`, message: 'duplicate_stage' });
      seenStages.add(stage.stageId);
      if (!declared.has(stage.stageId)) issues.push({ path: `stages.${index}.stageId`, message: 'unknown_stage' });
      const seen = new Set<string>();
      stage.interviewers.forEach((person, personIndex) => {
        const member = person.kind === 'member' ? members.find((m) => m.userId === person.userId) : undefined;
        if (person.kind === 'member' && !member) issues.push({ path: `stages.${index}.interviewers.${personIndex}.userId`, message: 'not_a_member' });
        const identity = person.kind === 'member' ? (person.userId ?? '') : (person.email ?? '').toLowerCase();
        if (seen.has(identity)) issues.push({ path: `stages.${index}.interviewers.${personIndex}`, message: 'duplicate_interviewer' });
        seen.add(identity);
        rows.push({
          id: deps.newId(),
          organizationId: actor.organizationId,
          jobId: job.id,
          stageId: stage.stageId,
          kind: person.kind,
          userId: person.kind === 'member' ? (person.userId ?? null) : null,
          email: person.kind === 'external' ? (person.email ?? '').toLowerCase() : null,
          name: member?.name ?? person.name ?? '',
          createdAt: now,
        });
      });
    });
    if (issues.length > 0) throw new ValidationError(issues);
    await deps.stageInterviewers.replaceForJob(actor.organizationId, job.id, rows);
    return group(rows);
  },
});
