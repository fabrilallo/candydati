import { z } from 'zod';
import type { Role } from './permissions.js';

/**
 * Per-job access (PRODUCT.md §6, "permissions by role and by ad"). The organization role says WHAT a person may do; the
 * job team says ON WHICH JOBS a person who is not organization-wide may do it. Candidates, applications, CVs, messages,
 * notes, feedback, tasks and reports are visible only through the jobs of the actor's scope.
 */
export const JOB_TEAM_ROLES = ['hiring_manager', 'interviewer', 'recruiter'] as const;
export type JobTeamRole = (typeof JOB_TEAM_ROLES)[number];

/** An explicit member of a job's team. Stage interviewers (`job_stage_interviewer`) are members implicitly. */
export interface JobTeamMember {
  readonly organizationId: string;
  readonly jobId: string;
  readonly userId: string;
  readonly role: JobTeamRole;
  /** Who added them; `system` for the automatic additions (creator, backfill). */
  readonly addedBy: string;
  readonly createdAt: Date;
}

/** Where a member of the team comes from: added to the team, or assigned as interviewer of a stage. */
export type JobTeamSource = 'team' | 'stage_interviewer';

export const jobTeamMemberInputSchema = z.object({
  userId: z.string().min(1).max(200),
  role: z.enum(JOB_TEAM_ROLES),
});
export type JobTeamMemberInput = z.infer<typeof jobTeamMemberInputSchema>;

/** The jobs an actor reaches: every job of the organization, or only those listed. */
export type JobScope = { readonly kind: 'organization' } | { readonly kind: 'jobs'; readonly jobIds: readonly string[] };

export const ORGANIZATION_SCOPE: JobScope = { kind: 'organization' };

export interface JobAccessSettings {
  /** Off by default: recruiters see every job. On: recruiters see only the jobs whose team they are on. */
  readonly restrictRecruitersToTeam: boolean;
}

/** Owners and admins always see every job; recruiters too unless the organization restricts them; the others never. */
export function hasOrganizationWideAccess(role: Role, settings: JobAccessSettings): boolean {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'recruiter') return !settings.restrictRecruitersToTeam;
  return false;
}

/** May a role ever be scoped to its jobs (so its scope needs a lookup)? */
export const isJobScopedRole = (role: Role): boolean => role !== 'owner' && role !== 'admin';

/** The team role a member joins with when added automatically (creator of the job, backfill). */
export function teamRoleFor(role: Role): JobTeamRole {
  if (role === 'hiring_manager' || role === 'interviewer') return role;
  return 'recruiter';
}

export function jobScopeIncludes(scope: JobScope, jobId: string | null | undefined): boolean {
  if (scope.kind === 'organization') return true;
  return jobId !== null && jobId !== undefined && scope.jobIds.includes(jobId);
}
