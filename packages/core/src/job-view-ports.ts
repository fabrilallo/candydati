import type { PublicJobDeps } from './job-ports.js';

/** What a visit is counted under. `day` is `YYYY-MM-DD` (UTC); `campaign` is `''` when the link had none. */
export interface JobViewKey {
  readonly organizationId: string;
  readonly jobId: string;
  readonly day: string;
  readonly source: string;
  readonly campaign: string;
}

export interface JobViewRow extends JobViewKey {
  readonly views: number;
}

/**
 * Daily visit counters of the public job page. Aggregate numbers only: nothing that identifies or tells apart two
 * visitors is ever passed to, or stored by, a repository.
 */
export interface JobViewRepository {
  /** Adds `by` (default 1) to the counter of `key`, creating it when absent: one upsert, safe under concurrency. */
  increment(key: JobViewKey, by?: number): Promise<void>;
  /** Deletes the counters of the days before `day` (`YYYY-MM-DD`), across organizations. Only for the daily retention job. Returns how many rows. */
  purgeBefore(day: string): Promise<number>;
}

export interface RecordJobViewDeps extends Pick<PublicJobDeps, 'jobs' | 'organizations'> {
  readonly jobViews: JobViewRepository;
  readonly now: () => Date;
}
