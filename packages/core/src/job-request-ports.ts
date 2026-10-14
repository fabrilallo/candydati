import type { Job, JobApproval, JobRequest, JobRequestStatus } from '@tt/domain';
import type { MemberDirectory, NotificationRepository } from './automation-ports.js';
import type { JobRepository } from './job-ports.js';
import type { CoreDeps } from './ports.js';

export interface JobRequestListQuery {
  readonly organizationId: string;
  readonly status?: JobRequestStatus | undefined;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
}

export interface JobRequestRepository {
  create(request: JobRequest): Promise<JobRequest>;
  /**
   * Full replace by (organizationId, id), only while the stored status is still `from` (a compare-and-set: Postgres
   * re-checks it after waiting on the row lock). Null when another decision got there first: the caller answers with a conflict.
   */
  transition(from: JobRequestStatus, next: JobRequest): Promise<JobRequest | null>;
  findById(organizationId: string, id: string): Promise<JobRequest | null>;
  /** Newest first. */
  list(query: JobRequestListQuery): Promise<{ readonly items: readonly JobRequest[]; readonly total: number }>;
  /** The open (`submitted`) request that asks approval for this draft, if any. */
  findOpenForJob(organizationId: string, jobId: string): Promise<JobRequest | null>;
}

/** Settings of an organization that are not email or privacy. Absent row means the defaults. */
export interface OrganizationSettings {
  readonly requireApproval: boolean;
}

export interface OrganizationSettingsRepository {
  get(organizationId: string): Promise<OrganizationSettings>;
  setRequireApproval(organizationId: string, value: boolean, at: Date): Promise<OrganizationSettings>;
}

/**
 * The approval of a job's budget. It lives next to the job but apart from `jobs.save`: saving a job never touches it, so an
 * edit cannot forge or wipe an approval.
 */
export interface JobApprovalRepository {
  find(organizationId: string, jobId: string): Promise<JobApproval | null>;
  /** Replaces the approval of the job. */
  set(organizationId: string, jobId: string, approval: JobApproval): Promise<void>;
}

export interface JobRequestDeps extends CoreDeps {
  readonly jobRequests: JobRequestRepository;
  readonly jobs: JobRepository;
  readonly approvals: JobApprovalRepository;
  readonly organizationSettings: OrganizationSettingsRepository;
  readonly members: MemberDirectory;
  readonly notifications: NotificationRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** A published job and when anything last happened to it. */
export interface StaleJob {
  readonly job: Job;
  readonly lastActivityAt: Date;
}

export interface StaleJobRepository {
  /**
   * Published jobs whose last activity (publication, content update, application received, move or decision) is at or
   * before `cutoff`, oldest activity first. `organizationId` absent: every organization (only for the scan).
   */
  listStale(cutoff: Date, organizationId?: string): Promise<readonly StaleJob[]>;
}

export interface StaleJobDeps extends CoreDeps {
  readonly staleJobs: StaleJobRepository;
  readonly now: () => Date;
}

/** The hourly scan is a system job over every organization. */
export interface StaleScanDeps {
  readonly staleJobs: StaleJobRepository;
  readonly jobs: JobRepository;
  readonly notifications: NotificationRepository;
  readonly members: MemberDirectory;
  readonly newId: () => string;
}
