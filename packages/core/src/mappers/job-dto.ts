import {
  checkPublishable,
  httpUrlOrNull,
  complianceWarnings,
  isPublishedContent,
  type Job,
  type JobDto,
  type JobSummaryDto,
  type JobTemplate,
  type JobTemplateDto,
  type PublicJobDto,
  type PublicJobSummaryDto,
  type PublicOrganizationDto,
  type PublishJobResultDto,
  type PublishedJobContent,
} from '@candydati/domain';
import type { PublicOrganization } from '../job-ports.js';
import type { PublishJobResult } from '../use-cases/jobs/publish-job.js';

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

export const toJobDto = (job: Job): JobDto => ({
  id: job.id,
  slug: job.slug,
  status: job.status,
  content: job.content,
  quality: job.quality,
  // Compliance issues carry the offending text and a suggested fix for the editor.
  publishIssues: checkPublishable(job.content).map(({ path, rule, detail }) => (detail ? { path, rule, detail } : { path, rule })),
  complianceWarnings: complianceWarnings(job.content).map(({ path, rule, detail }) => ({ path, rule, detail })),
  createdAt: iso(job.createdAt),
  updatedAt: iso(job.updatedAt),
  publishedAt: isoOrNull(job.publishedAt),
  closedAt: isoOrNull(job.closedAt),
});

export const toJobSummaryDto = (job: Job, qualityThreshold: number): JobSummaryDto => {
  const issueCount = checkPublishable(job.content).length;
  return {
    id: job.id,
    slug: job.slug,
    status: job.status,
    title: job.content.title,
    role: job.content.role ?? null,
    publishable: issueCount === 0,
    publishIssueCount: issueCount,
    salary: job.content.salary,
    workMode: job.content.workMode ?? null,
    qualityTotal: job.quality?.total ?? null,
    belowThreshold: job.quality !== null && job.quality.total < qualityThreshold,
    updatedAt: iso(job.updatedAt),
    publishedAt: isoOrNull(job.publishedAt),
  };
};

export const toJobTemplateDto = (template: JobTemplate): JobTemplateDto => ({
  id: template.id,
  name: template.name,
  content: template.content,
  updatedAt: iso(template.updatedAt),
});

export const toPublishJobResultDto = (result: PublishJobResult): PublishJobResultDto => ({
  job: toJobDto(result.job),
  quality: result.quality,
});

export const toPublicOrganizationDto = (organization: PublicOrganization): PublicOrganizationDto => ({
  name: organization.name,
  slug: organization.slug,
  logo: httpUrlOrNull(organization.logo, { httpsOnly: true }),
});

/** A published job that fails the §5.1 rules is corrupted data, not a user error: fail loudly. */
function publishedParts(job: Job): { readonly content: PublishedJobContent; readonly publishedAt: string; readonly updatedAt: string } {
  if (job.status !== 'published' || job.publishedAt === null) {
    throw new Error(`Job ${job.id} is not published: it cannot be exposed publicly.`);
  }
  if (!isPublishedContent(job.content)) {
    throw new Error(`Job ${job.id} is published but fails the publication rules (corrupted data).`);
  }
  return { content: job.content, publishedAt: iso(job.publishedAt), updatedAt: iso(job.updatedAt) };
}

export function toPublicJobDto(job: Job): PublicJobDto {
  const { content, publishedAt, updatedAt } = publishedParts(job);
  return { slug: job.slug, content, publishedAt, updatedAt };
}

export function toPublicJobSummaryDto(job: Job): PublicJobSummaryDto {
  const { content, publishedAt, updatedAt } = publishedParts(job);
  return {
    slug: job.slug,
    title: content.title,
    role: content.role,
    seniority: content.seniority,
    contractType: content.contractType,
    workMode: content.workMode,
    location: content.location,
    salary: content.salary,
    stageCount: content.process.length,
    responseDays: content.responseDays,
    publishedAt,
    updatedAt,
  };
}
