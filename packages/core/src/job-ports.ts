import type { AdQualityAnalyzer, Job, JobStatus, JobTemplate } from '@tt/domain';
import type { CoreDeps } from './ports.js';

export interface JobListQuery {
  readonly organizationId: string;
  readonly status?: JobStatus | undefined;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
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
}

export interface JobDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly jobTemplates: JobTemplateRepository;
  readonly organizations: OrganizationDirectory;
  readonly adQuality: AdQualityAnalyzer;
  /** On the 0-10 scale; below it the ad is flagged, never blocked. */
  readonly adQualityThreshold: number;
  readonly newId: () => string;
  readonly now: () => Date;
}

export type PublicJobDeps = Pick<JobDeps, 'jobs' | 'organizations'>;
