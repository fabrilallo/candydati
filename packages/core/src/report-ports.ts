import type { DurationStat, Outcome, ResponsePromise, StageEvent } from '@tt/domain';
import type { JobRepository } from './job-ports.js';
import type { CoreDeps } from './ports.js';

/** Append-only history of stage entries and decisions. Every method filters by organization. */
export interface StageEventRepository {
  record(event: StageEvent): Promise<StageEvent>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly StageEvent[]>;
}

export interface ResponsePromiseRepository {
  create(promise: ResponsePromise): Promise<ResponsePromise>;
  /** Full replace by (organizationId, id). */
  save(promise: ResponsePromise): Promise<ResponsePromise>;
  /** The promise of the application nobody answered yet (`respondedAt` null, open or already missed). At most one. */
  findUnanswered(organizationId: string, applicationId: string): Promise<ResponsePromise | null>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly ResponsePromise[]>;
  /** `open` and past `dueAt` become `missed` (`respondedAt` stays null), across organizations. Only for the hourly scan. Returns how many. */
  markOverdueMissedAcrossOrganizations(now: Date): Promise<number>;
}

/** What the use cases that keep the history need. */
export interface TrackingDeps {
  readonly stageEvents: StageEventRepository;
  readonly promises: ResponsePromiseRepository;
  readonly newId: () => string;
}

/**
 * Period is closed on both ends: `from <= t <= to`. `jobId` narrows every figure to one job. Everything is filtered by
 * organization.
 */
export interface ReportAggregateQuery {
  readonly organizationId: string;
  readonly from: Date;
  readonly to: Date;
  readonly jobId?: string | undefined;
  /** For "waiting now" and "overdue now". */
  readonly now: Date;
}

export interface JobCount {
  readonly jobId: string;
}

/**
 * Raw aggregates by id, computed in SQL by the Postgres adapter and in memory by the test one; the use case adds titles,
 * stage types and rates. Durations are rounded to 2 decimals.
 */
export interface ReportAggregates {
  /** Applications decided `hired` in the period (`closedAt`): days from `createdAt`. */
  readonly hireDays: { readonly overall: DurationStat; readonly byJob: readonly (JobCount & { readonly stat: DurationStat })[] };
  /** Jobs whose FIRST hire (`closedAt`) falls in the period. */
  readonly firstHires: readonly (JobCount & { readonly firstHireAt: Date })[];
  /** Distinct applications that entered each stage in the period. */
  readonly stageEntries: readonly (JobCount & { readonly stageId: string; readonly entered: number })[];
  /**
   * Cohort pairs: distinct applications that entered `fromStageId` in the period and LATER (also in the period) entered
   * `toStageId` of the same job, or were hired (`toStageId` null). Always a subset of the `fromStageId` cohort.
   */
  readonly stageAdvances: readonly (JobCount & { readonly fromStageId: string; readonly toStageId: string | null; readonly count: number })[];
  /** Decisions in the period, from stage events. */
  readonly outcomes: readonly (JobCount & { readonly outcome: Outcome; readonly count: number })[];
  /** Applications created in the period, and hires decided in the period, by origin. Origins with neither are absent. */
  readonly origins: readonly { readonly origin: string; readonly applications: number; readonly hires: number }[];
  /** Promises closed in the period: answered in it, or missed at a deadline falling in it. */
  readonly promisesClosed: readonly (JobCount & { readonly stageId: string; readonly kept: number; readonly missed: number })[];
  /** Hours from start to answer, of the closed promises that were answered. */
  readonly responseHours: DurationStat;
  /** Promises nobody answered yet, and among them the ones past due at `now`. Not limited to the period. */
  readonly promisesWaiting: readonly (JobCount & { readonly open: number; readonly overdue: number })[];
  /** Applications created in the period, and how many have an outcome. */
  readonly coverage: readonly (JobCount & { readonly total: number; readonly decided: number })[];
}

export interface ReportRepository {
  aggregate(query: ReportAggregateQuery): Promise<ReportAggregates>;
}

export interface ReportDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly reports: ReportRepository;
  readonly now: () => Date;
}
