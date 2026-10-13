import {
  checkPublishable,
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
} from '@tt/domain';
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
  publishIssues: checkPublishable(job.content).map(({ path, rule }) => ({ path, rule })),
  createdAt: iso(job.createdAt),
  updatedAt: iso(job.updatedAt),
  publishedAt: isoOrNull(job.publishedAt),
  closedAt: isoOrNull(job.closedAt),
});

export const toJobSummaryDto = (job: Job): JobSummaryDto => ({
  id: job.id,
  slug: job.slug,
  status: job.status,
  title: job.content.title,
  role: job.content.role ?? null,
  publishable: checkPublishable(job.content).length === 0,
  qualityTotal: job.quality?.total ?? null,
  updatedAt: iso(job.updatedAt),
  publishedAt: isoOrNull(job.publishedAt),
});

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
  logo: organization.logo,
});

/** A published job that fails the §5.1 rules is corrupted data, not a user error: fail loudly. */
function publishedParts(job: Job): { readonly content: PublishedJobContent; readonly publishedAt: string } {
  if (job.status !== 'published' || job.publishedAt === null) {
    throw new Error(`Job ${job.id} is not published: it cannot be exposed publicly.`);
  }
  if (!isPublishedContent(job.content)) {
    throw new Error(`Job ${job.id} is published but fails the publication rules (corrupted data).`);
  }
  return { content: job.content, publishedAt: iso(job.publishedAt) };
}

export function toPublicJobDto(job: Job): PublicJobDto {
  const { content, publishedAt } = publishedParts(job);
  return { slug: job.slug, content, publishedAt };
}

export function toPublicJobSummaryDto(job: Job): PublicJobSummaryDto {
  const { content, publishedAt } = publishedParts(job);
  return {
    slug: job.slug,
    title: content.title,
    role: content.role,
    seniority: content.seniority,
    contractType: content.contractType,
    workMode: content.workMode,
    location: content.location,
    salary: content.salary,
    publishedAt,
  };
}
