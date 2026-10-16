import type { JobTeamMember } from '@candydati/domain';

/**
 * Job teams and the lookups behind per-job access (PRODUCT.md §6). Every method filters by organization.
 * `jobIdsOf` is the one source of a person's jobs: explicit team rows plus the jobs where they interview at a stage.
 */
export interface JobTeamRepository {
  /** Jobs whose team `userId` is on: explicit members and stage interviewers. */
  jobIdsOf(organizationId: string, userId: string): Promise<readonly string[]>;
  /** The organization setting "recruiters see only their jobs". False when never set. */
  restrictsRecruiters(organizationId: string): Promise<boolean>;
  /** The ids among `candidateIds` with at least one application in `jobIds`. */
  candidatesIn(organizationId: string, candidateIds: readonly string[], jobIds: readonly string[]): Promise<readonly string[]>;
  /** The ids among `applicationIds` whose job is in `jobIds`. */
  applicationsIn(organizationId: string, applicationIds: readonly string[], jobIds: readonly string[]): Promise<readonly string[]>;
  /** Explicit members of a job, oldest first. Stage interviewers are not listed here. */
  list(organizationId: string, jobId: string): Promise<readonly JobTeamMember[]>;
  /** Adds the member, or changes their role when already on the team. */
  upsert(member: JobTeamMember): Promise<JobTeamMember>;
  /** Adds the member only when absent (automatic additions never change a role someone chose). */
  addIfAbsent(member: JobTeamMember): Promise<void>;
  /** True when a row was removed. */
  remove(organizationId: string, jobId: string, userId: string): Promise<boolean>;
}
