import { z } from 'zod';
import type { PublishedJobContent } from '../job/content.js';
import type { PublicOrganizationDto } from '../job/job.js';

/** `pending`: waiting for the first sync or a retry; `failed`: the channel refused it (see `error`); `removed`: taken down. */
export const DISTRIBUTION_STATUSES = ['pending', 'published', 'failed', 'removed'] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

/** The built-in XML feed is a channel-like row computed from the job status, never stored. */
export const FEED_CHANNEL_ID = 'feed';
export const FEED_CHANNEL_LABEL = 'Feed XML';

export const CHANNEL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const DISTRIBUTION_ERROR_MAX = 300;

/** Stored per (organization, job, channel). */
export interface JobDistribution {
  readonly organizationId: string;
  readonly jobId: string;
  readonly channelId: string;
  readonly status: DistributionStatus;
  /** Id of the ad on the external channel, when the channel gave one. */
  readonly externalId: string | null;
  /** Where the ad lives on the channel. */
  readonly url: string | null;
  /** A short reason when `status` is `failed`; never a response body or a secret. */
  readonly error: string | null;
  readonly updatedAt: Date;
}

/** Per-organization switch of a registered channel. No row means enabled. */
export interface DistributionSetting {
  readonly organizationId: string;
  readonly channelId: string;
  readonly enabled: boolean;
  readonly updatedAt: Date;
}

export const setChannelEnabledInputSchema = z.object({ enabled: z.boolean() });

// --- HTTP shapes (dates as ISO strings) ---

export interface JobDistributionDto {
  readonly channelId: string;
  readonly label: string;
  readonly status: DistributionStatus;
  readonly url: string | null;
  readonly error: string | null;
  readonly updatedAt: string | null;
}

export interface DistributionChannelDto {
  readonly channelId: string;
  readonly label: string;
  /** True for the XML feed: always on, nothing to switch. */
  readonly builtIn: boolean;
  readonly enabled: boolean;
}

export interface DistributionOverviewDto {
  readonly feedUrl: string;
  readonly llmsTxtUrl: string;
  /** The feed first, then the registered channels (none in the open source distribution). */
  readonly channels: readonly DistributionChannelDto[];
}

/** What a visitor may learn about an organization. No ids of people. */
export interface PublicOrganizationSummaryDto extends PublicOrganizationDto {
  readonly careersUrl: string;
  readonly feedUrl: string;
  readonly openPositions: number;
}

/** What a channel receives: the public face of the ad, never internal fields. */
export interface DistributionJobView {
  readonly id: string;
  readonly slug: string;
  readonly content: PublishedJobContent;
  readonly publishedAt: string;
  readonly updatedAt: string;
  /** Canonical public URL of the ad. */
  readonly url: string;
}
