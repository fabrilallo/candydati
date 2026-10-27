import { z } from 'zod';
import { COMPLIANCE_WARNING_RULES } from './compliance/types.js';
import { jobContentSchema, type JobContent, type PublishIssue, type PublishedJobContent } from './content.js';
import { adQualityReportSchema, type AdQualityAssessment, type AdQualityReport, type AdQualityStatus } from './quality.js';

/** draft -> published -> closed. A closed ad is never reopened: a new one is created from it. */
export const JOB_STATUSES = ['draft', 'published', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  readonly id: string;
  readonly organizationId: string;
  /** Unique inside the organization, assigned at creation, never changes: it is the public URL. */
  readonly slug: string;
  readonly status: JobStatus;
  readonly content: JobContent;
  /** Report computed at the last publication; null for drafts never published. */
  readonly quality: AdQualityReport | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface JobTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly content: JobContent;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const TEMPLATE_NAME_MAX = 80;
export const SLUG_MAX = 80;

/** `Backend Developer (Milano)` + `a1b2c3` -> `backend-developer-milano-a1b2c3`. */
export function jobSlug(title: string, suffix: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX - suffix.length - 1)
    .replace(/-+$/g, '');
  return base.length > 0 ? `${base}-${suffix}` : suffix;
}

// --- HTTP shapes (dates as ISO strings). The same shapes are used by REST, agent tools and MCP tools. ---

const isoDate = z.iso.datetime();

const complianceDetailSchema = z.object({ match: z.string(), suggestion: z.string() });

export const jobDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(JOB_STATUSES),
  content: jobContentSchema,
  quality: adQualityReportSchema.nullable(),
  /** Empty when the ad satisfies PRODUCT.md §4.1 and may be published. */
  publishIssues: z.array(z.object({ path: z.string(), rule: z.string(), detail: complianceDetailSchema.optional() })),
  /** Doubtful compliance findings: shown to the author, never blocking. */
  complianceWarnings: z.array(z.object({ path: z.string(), rule: z.enum(COMPLIANCE_WARNING_RULES), detail: complianceDetailSchema })),
  createdAt: isoDate,
  updatedAt: isoDate,
  publishedAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
});
export type JobDto = Omit<z.infer<typeof jobDtoSchema>, 'publishIssues'> & { readonly publishIssues: readonly PublishIssue[] };

export interface JobSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly status: JobStatus;
  readonly title: string;
  readonly role: JobContent['role'] | null;
  /** The role text when `role` is `other`, otherwise null. */
  readonly customRole: string | null;
  readonly publishable: boolean;
  /** How many publication rules the draft still fails (0 when `publishable`). */
  readonly publishIssueCount: number;
  readonly salary: JobContent['salary'];
  readonly workMode: JobContent['workMode'] | null;
  /** The stored score a model produced, null without one or while no model is configured (PRODUCT.md §4.3). */
  readonly qualityTotal: number | null;
  /** True when the shown score is under the platform threshold. Always false without a score. */
  readonly belowThreshold: boolean;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface JobTemplateDto {
  readonly id: string;
  readonly name: string;
  readonly content: JobContent;
  readonly updatedAt: string;
}

export interface PublishJobResultDto {
  readonly job: JobDto;
  /** Null unless `qualityStatus` is `assessed`: publication never waits on the score. */
  readonly quality: AdQualityAssessment | null;
  readonly qualityStatus: AdQualityStatus;
}

/** What anyone can read without signing in. Never carries internal ids of people or the quality report. */
export interface PublicOrganizationDto {
  readonly name: string;
  readonly slug: string;
  readonly logo: string | null;
}

export interface PublicJobDto {
  readonly slug: string;
  readonly content: PublishedJobContent;
  readonly publishedAt: string;
  /** Last edit: feeds and sitemaps use it as `lastmod`. */
  readonly updatedAt: string;
}

export interface PublicJobSummaryDto {
  readonly slug: string;
  readonly title: string;
  readonly role: PublishedJobContent['role'];
  /** The role text when `role` is `other`. */
  readonly customRole?: string;
  readonly seniority: PublishedJobContent['seniority'];
  readonly contractType: PublishedJobContent['contractType'];
  readonly workMode: PublishedJobContent['workMode'];
  readonly location: PublishedJobContent['location'];
  readonly salary: PublishedJobContent['salary'];
  /** Number of selection stages the candidate will go through. */
  readonly stageCount: number;
  /** Days within which the candidate hears back after each stage. */
  readonly responseDays: number;
  readonly publishedAt: string;
  readonly updatedAt: string;
}

export interface PublicCareersDto {
  readonly organization: PublicOrganizationDto;
  readonly jobs: readonly PublicJobSummaryDto[];
}

/** Everything the feeds need to render without authentication: the full content of every published ad. */
export interface PublicFeedDto {
  readonly organization: PublicOrganizationDto;
  readonly jobs: readonly PublicJobDto[];
}

export interface PublicJobPageDto {
  readonly organization: PublicOrganizationDto;
  readonly job: PublicJobDto;
}
