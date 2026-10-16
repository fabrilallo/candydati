import { hasOrganizationWideAccess, isJobScopedRole, ORGANIZATION_SCOPE, type JobScope } from '@candydati/domain';
import type { Actor } from '../actor.js';
import type { JobTeamRepository } from '../job-team-ports.js';

/**
 * The jobs one use case run may reach, resolved once and lazily (owners and admins never pay a lookup). Every scoped
 * repository asks it; nothing else decides per-job access.
 */
export interface JobScopeContext {
  readonly organizationId: string;
  /** The person behind the actor (the user, or the user an agent or API key acts for); null for the system. */
  readonly userId: string | null;
  scope(): Promise<JobScope>;
  /** Null: every job of the organization. */
  jobIds(): Promise<readonly string[] | null>;
  allowsJob(jobId: string | null | undefined): Promise<boolean>;
  /** The ids among `applicationIds` whose job is in scope. */
  applicationsIn(applicationIds: readonly string[]): Promise<readonly string[]>;
  /** The ids among `candidateIds` with an application in scope. */
  candidatesIn(candidateIds: readonly string[]): Promise<readonly string[]>;
}

/** Thrown when a job-scoped actor runs without the team repository: access fails closed, never open. */
export class MissingJobTeamsError extends Error {
  constructor() {
    super('jobTeams is required to resolve the jobs of a job-scoped actor');
    this.name = 'MissingJobTeamsError';
  }
}

const personOf = (actor: Actor): string | null => (actor.type === 'user' ? actor.id : actor.onBehalfOfUserId);

/**
 * Owners, admins and the system: every job. Recruiters: every job unless the organization restricts them. Hiring
 * managers and interviewers (and restricted recruiters): the jobs whose team they are on. Agents and API keys get the
 * scope of the person they act for, never more.
 */
export async function resolveJobScope(jobTeams: JobTeamRepository | undefined, actor: Actor): Promise<JobScope> {
  const userId = personOf(actor);
  if (actor.type === 'system' || !isJobScopedRole(actor.role)) return ORGANIZATION_SCOPE;
  if (!jobTeams) throw new MissingJobTeamsError();
  if (actor.role === 'recruiter') {
    const restrictRecruitersToTeam = await jobTeams.restrictsRecruiters(actor.organizationId);
    if (hasOrganizationWideAccess(actor.role, { restrictRecruitersToTeam })) return ORGANIZATION_SCOPE;
  }
  if (userId === null) return { kind: 'jobs', jobIds: [] };
  return { kind: 'jobs', jobIds: await jobTeams.jobIdsOf(actor.organizationId, userId) };
}

export function createJobScopeContext(jobTeams: JobTeamRepository | undefined, actor: Actor): JobScopeContext {
  let resolved: Promise<JobScope> | undefined;
  const scope = (): Promise<JobScope> => {
    resolved ??= resolveJobScope(jobTeams, actor);
    return resolved;
  };
  const jobIds = async (): Promise<readonly string[] | null> => {
    const current = await scope();
    return current.kind === 'organization' ? null : current.jobIds;
  };
  const narrow = async (ids: readonly string[], lookup: (team: JobTeamRepository, jobs: readonly string[]) => Promise<readonly string[]>) => {
    const jobs = await jobIds();
    if (jobs === null) return ids;
    if (ids.length === 0 || jobs.length === 0 || !jobTeams) return [];
    return lookup(jobTeams, jobs);
  };
  return {
    organizationId: actor.organizationId,
    userId: personOf(actor),
    scope,
    jobIds,
    async allowsJob(jobId) {
      const jobs = await jobIds();
      if (jobs === null) return true;
      return jobId !== null && jobId !== undefined && jobs.includes(jobId);
    },
    applicationsIn: (ids) => narrow(ids, (team, jobs) => team.applicationsIn(actor.organizationId, ids, jobs)),
    candidatesIn: (ids) => narrow(ids, (team, jobs) => team.candidatesIn(actor.organizationId, ids, jobs)),
  };
}
