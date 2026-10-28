import type { TrackedLink } from '@candydati/domain';
import type { JobRepository } from './job-ports.js';
import type { CoreDeps } from './ports.js';

/** Tracked links saved on a job. Every method filters by organization and job. */
export interface TrackedLinkRepository {
  /** The links of one job, oldest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly TrackedLink[]>;
  countByJob(organizationId: string, jobId: string): Promise<number>;
  /**
   * Saves the link unless the job already has the same (source, campaign): then the stored one is returned and
   * `created` is false. Safe under concurrent saves of the same pair.
   */
  insertIfAbsent(link: TrackedLink): Promise<{ readonly link: TrackedLink; readonly created: boolean }>;
  /** True when a row was removed. */
  remove(organizationId: string, jobId: string, linkId: string): Promise<boolean>;
}

export interface TrackedLinkDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly trackedLinks: TrackedLinkRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}
