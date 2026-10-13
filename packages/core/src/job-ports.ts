import type { AdQualityAnalyzer, Job, JobStatus, JobTemplate } from '@tt/domain';
import type { PrivacyNoticeRepository } from './candidate-ports.js';
import type { AutomationRuleRepository } from './automation-ports.js';
import type { CoreDeps } from './ports.js';
import type { OutboxRepository } from './webhook-ports.js';

export interface JobListQuery {
  readonly organizationId: string;
  readonly status?: JobStatus | undefined;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
}

/** Jobs in one week: `week` is the Monday (UTC) that opens it, `YYYY-MM-DD`. */
export interface WeeklyCount {
  readonly week: string;
  readonly count: number;
}

/** Weeks with no activity are absent; the caller fills them. */
export interface WeeklyActivity {
  /** Bucketed by `createdAt`. */
  readonly created: readonly WeeklyCount[];
  /** Bucketed by `publishedAt`, closed ads included: they were published once. */
  readonly published: readonly WeeklyCount[];
}

/** Every method takes the organization id and filters by it: there is no query without it. */
export interface JobRepository {
  /** @throws ConflictError when the slug is already used in the organization. */
  create(job: Job): Promise<Job>;
  findById(organizationId: string, id: string): Promise<Job | null>;
  /** Full replace by (organizationId, id). */
  save(job: Job): Promise<Job>;
  /** Newest `updatedAt` first. */
  list(query: JobListQuery): Promise<{ readonly items: readonly Job[]; readonly total: number }>;
  /** Published only, newest `publishedAt` first. */
  listPublished(organizationId: string): Promise<readonly Job[]>;
  /** Published only: drafts and closed jobs are never found. */
  findPublishedBySlug(organizationId: string, slug: string): Promise<Job | null>;
  /** Number of jobs per status in the organization; statuses with no job are 0. */
  countByStatus(organizationId: string): Promise<Record<JobStatus, number>>;
  /**
   * Created and published counts per UTC week (weeks start Monday 00:00 UTC), only for timestamps `>= since`,
   * oldest week first.
   */
  weeklyActivity(organizationId: string, since: Date): Promise<WeeklyActivity>;
  /** Every job of the organization with `status`, newest `updatedAt` first. */
  listByStatus(organizationId: string, status: JobStatus): Promise<readonly Job[]>;
}

export interface JobTemplateRepository {
  create(template: JobTemplate): Promise<JobTemplate>;
  list(organizationId: string): Promise<readonly JobTemplate[]>;
  findById(organizationId: string, id: string): Promise<JobTemplate | null>;
  /** True when a template was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
}

export interface PublicOrganization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly logo: string | null;
}

export interface OrganizationDirectory {
  findBySlug(slug: string): Promise<PublicOrganization | null>;
  findById(id: string): Promise<PublicOrganization | null>;
}

/** Open applications (no outcome yet) of a job, grouped by pipeline stage id. Always filtered by organization. */
export interface OpenApplicationCounts {
  /** Stages with no open application are absent. */
  openByStage(organizationId: string, jobId: string): Promise<Readonly<Record<string, number>>>;
}

export interface JobDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly jobTemplates: JobTemplateRepository;
  readonly applicationCounts: OpenApplicationCounts;
  readonly organizations: OrganizationDirectory;
  /** Publishing a job requires an active privacy notice. */
  readonly privacyNotices: PrivacyNoticeRepository;
  /** Removing a stage removes its automation rules. */
  readonly automationRules: AutomationRuleRepository;
  /** `job.published` and `job.closed` events for webhooks. */
  readonly outbox: OutboxRepository;
  readonly adQuality: AdQualityAnalyzer;
  /** On the 0-10 scale; below it the ad is flagged, never blocked. */
  readonly adQualityThreshold: number;
  readonly newId: () => string;
  readonly now: () => Date;
}

export type PublicJobDeps = Pick<JobDeps, 'jobs' | 'organizations' | 'privacyNotices'>;
