import { z } from 'zod';
import { DISTRIBUTION_STATUSES, type DistributionChannelDto, type DistributionOverviewDto, type JobDistributionDto } from '../distribution/distribution.js';
import { isoDate } from './common.js';

/** One channel of one job (`GET /jobs/:id/distribution`, and the answer of the sync). */
export const jobChannelSchema = z.object({
  channelId: z.string(),
  label: z.string(),
  status: z.enum(DISTRIBUTION_STATUSES),
  url: z.string().nullable(),
  error: z.string().nullable(),
  updatedAt: isoDate.nullable(),
}) satisfies z.ZodType<JobDistributionDto>;

export const jobDistributionSchema = z.array(jobChannelSchema);

export const channelSettingSchema = z.object({
  channelId: z.string(),
  label: z.string(),
  builtIn: z.boolean(),
  enabled: z.boolean(),
}) satisfies z.ZodType<DistributionChannelDto>;

/** `GET /distribution`: the feed first (built in), then the registered channels. */
export const distributionOverviewSchema = z.object({
  feedUrl: z.string(),
  llmsTxtUrl: z.string(),
  channels: z.array(channelSettingSchema),
}) satisfies z.ZodType<DistributionOverviewDto>;
