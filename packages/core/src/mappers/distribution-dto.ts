import {
  FEED_CHANNEL_ID,
  FEED_CHANNEL_LABEL,
  feedUrl,
  isPublishedContent,
  jobUrl,
  type DistributionJobView,
  type Job,
  type JobDistribution,
  type JobDistributionDto,
} from '@candydati/domain';
import type { DistributionChannel } from '../distribution-ports.js';
import type { PublicOrganization } from '../job-ports.js';

/** The ad as a channel sees it. A job that is not publishable is a caller bug: it must never reach a channel. */
export function toDistributionJobView(job: Job, organization: PublicOrganization, baseUrl: string): DistributionJobView {
  if (job.status !== 'published' || job.publishedAt === null || !isPublishedContent(job.content)) {
    throw new Error(`Job ${job.id} is not published: it cannot be sent to a channel.`);
  }
  return {
    id: job.id,
    slug: job.slug,
    content: job.content,
    publishedAt: job.publishedAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    url: jobUrl(baseUrl, organization.slug, job.slug),
  };
}

/** The XML feed is computed from the job, never stored: it holds the ad exactly while the ad is published. */
export function feedDistributionDto(job: Job, organization: PublicOrganization, baseUrl: string): JobDistributionDto {
  const base = { channelId: FEED_CHANNEL_ID, label: FEED_CHANNEL_LABEL, error: null };
  if (job.status === 'published') return { ...base, status: 'published', url: feedUrl(baseUrl, organization.slug), updatedAt: job.updatedAt.toISOString() };
  if (job.status === 'closed') return { ...base, status: 'removed', url: null, updatedAt: (job.closedAt ?? job.updatedAt).toISOString() };
  return { ...base, status: 'pending', url: null, updatedAt: null };
}

export const toJobDistributionDto = (channel: Pick<DistributionChannel, 'id' | 'label'>, row: JobDistribution): JobDistributionDto => ({
  channelId: channel.id,
  label: channel.label,
  status: row.status,
  url: row.url,
  error: row.error,
  updatedAt: row.updatedAt.toISOString(),
});
