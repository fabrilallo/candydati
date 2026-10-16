import { jobTeamMemberInputSchema, type JobTeamMember, type JobTeamRole, type JobTeamSource } from '@candydati/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import type { MemberDirectory } from '../../automation-ports.js';
import { ValidationError } from '../../errors.js';
import type { StageInterviewerRepository } from '../../feedback-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { JobTeamRepository } from '../../job-team-ports.js';
import type { CoreDeps } from '../../ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import { requireJob } from './shared.js';

export interface JobTeamDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly jobTeams: JobTeamRepository;
  readonly stageInterviewers: StageInterviewerRepository;
  readonly members: MemberDirectory;
  readonly now: () => Date;
}

export const defineJobTeamUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<JobTeamDeps, S, O>): UseCase<JobTeamDeps, O> =>
  defineUseCase<JobTeamDeps, S, O>(definition);

export interface JobTeamMemberView {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** The team role; a stage interviewer who is not on the team explicitly is an `interviewer`. */
  readonly role: JobTeamRole;
  readonly source: JobTeamSource;
  /** Stages of the job they interview at (any source). */
  readonly stageIds: readonly string[];
  /** False for stage interviewers: they leave the team by being removed from the stage. */
  readonly removable: boolean;
  readonly addedAt: Date | null;
}

export interface JobTeamView {
  readonly jobId: string;
  readonly members: readonly JobTeamMemberView[];
}

const FORMER_MEMBER = 'Former member';

async function loadTeam(deps: JobTeamDeps, organizationId: string, jobId: string): Promise<JobTeamView> {
  const [explicit, interviewers, directory] = [
    await deps.jobTeams.list(organizationId, jobId),
    await deps.stageInterviewers.listByJob(organizationId, jobId),
    await deps.members.list(organizationId),
  ];
  const person = (userId: string) => directory.find((member) => member.userId === userId);
  const stagesOf = (userId: string) => interviewers.filter((i) => i.userId === userId).map((i) => i.stageId);
  const fromTeam = explicit.map((member) => ({
    userId: member.userId,
    name: person(member.userId)?.name ?? FORMER_MEMBER,
    email: person(member.userId)?.email ?? '',
    role: member.role,
    source: 'team' as const,
    stageIds: stagesOf(member.userId),
    removable: true,
    addedAt: member.createdAt,
  }));
  const onTeam = new Set(explicit.map((member) => member.userId));
  const interviewerIds = [...new Set(interviewers.flatMap((i) => (i.userId !== null && !onTeam.has(i.userId) ? [i.userId] : [])))];
  const fromStages = interviewerIds.map((userId) => ({
    userId,
    name: person(userId)?.name ?? interviewers.find((i) => i.userId === userId)?.name ?? FORMER_MEMBER,
    email: person(userId)?.email ?? '',
    role: 'interviewer' as const,
    source: 'stage_interviewer' as const,
    stageIds: stagesOf(userId),
    removable: false,
    addedAt: null,
  }));
  return { jobId, members: [...fromTeam, ...fromStages] };
}

/** The "Team" tab: explicit members and the stage interviewers, who are members implicitly. */
export const getJobTeam = defineJobTeamUseCase({
  name: 'getJobTeam',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job_team:read',
  audit: { skip: 'read of configuration, no candidate data' },
  handler: async ({ deps, actor, input }): Promise<JobTeamView> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    return loadTeam(deps, actor.organizationId, job.id);
  },
});

/** Adds a member of the organization to the team of a job, or changes their team role. Only on jobs the actor reaches. */
export const addJobTeamMember = defineJobTeamUseCase({
  name: 'addJobTeamMember',
  input: jobTeamMemberInputSchema.extend({ jobId: z.string().min(1) }),
  permission: 'job_team:manage',
  audit: {
    action: 'job.team_member_added',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input) => ({ userId: input.userId, role: input.role }),
  },
  handler: async ({ deps, actor, input }): Promise<JobTeamView> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const members = await deps.members.list(actor.organizationId);
    if (!members.some((member) => member.userId === input.userId)) throw new ValidationError([{ path: 'userId', message: 'not_a_member' }]);
    const member: JobTeamMember = {
      organizationId: actor.organizationId,
      jobId: job.id,
      userId: input.userId,
      role: input.role,
      addedBy: toActorUserId(actor),
      createdAt: deps.now(),
    };
    await deps.jobTeams.upsert(member);
    return loadTeam(deps, actor.organizationId, job.id);
  },
});

/** Removes an explicit member. A stage interviewer stays a member until removed from the stage. */
export const removeJobTeamMember = defineJobTeamUseCase({
  name: 'removeJobTeamMember',
  input: z.object({ jobId: z.string().min(1), userId: z.string().min(1).max(200) }),
  permission: 'job_team:manage',
  audit: {
    action: 'job.team_member_removed',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input) => ({ userId: input.userId }),
  },
  handler: async ({ deps, actor, input }): Promise<{ readonly removed: boolean }> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    return { removed: await deps.jobTeams.remove(actor.organizationId, job.id, input.userId) };
  },
});
