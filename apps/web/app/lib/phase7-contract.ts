import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 7 wire shapes (distribution): the api builds them at the same time, so the web
 * reads them leniently here, in this one file, until a shared module exports them. A status the web does not know
 * is shown as pending; a missing field falls back to null.
 */
const isoDate = z.iso.datetime({ offset: true })

export const DISTRIBUTION_PATH = '/api/v1/distribution'
const jobDistributionPath = (jobId: string): string => `/api/v1/jobs/${encodeURIComponent(jobId)}/distribution`
export const jobDistributionListPath = jobDistributionPath
export const jobDistributionSyncPath = (jobId: string): string => `${jobDistributionPath(jobId)}/sync`
export const channelSettingPath = (channelId: string): string => `${DISTRIBUTION_PATH}/channels/${encodeURIComponent(channelId)}`

/** The ids the built-in feed row may carry: it is computed, never stored, so it has no registered channel. */
export const FEED_CHANNEL_IDS: readonly string[] = ['feed', 'xml_feed', 'jobs_feed', 'xml']

export const DISTRIBUTION_STATUSES = ['feed', 'pending', 'published', 'failed', 'removed'] as const
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number]

const statusSchema = z.string().transform((raw): DistributionStatus => ((DISTRIBUTION_STATUSES as readonly string[]).includes(raw) ? (raw as DistributionStatus) : 'pending'))

export const jobChannelSchema = z.object({
  channelId: z.string(),
  label: z.string().default(''),
  status: statusSchema,
  url: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  updatedAt: isoDate.nullable().default(null),
})
export type JobChannelDto = z.output<typeof jobChannelSchema>

export const jobDistributionSchema = z.array(jobChannelSchema)

/** A channel of `GET /distribution`: `channelId` on the wire (the web also accepts `id`), `builtIn` for the feed. */
export const channelSettingSchema = z.preprocess(
  (raw) => (typeof raw === 'object' && raw !== null && !('channelId' in raw) && 'id' in raw ? { ...raw, channelId: (raw as { id: unknown }).id } : raw),
  z.object({ channelId: z.string(), label: z.string().default(''), enabled: z.boolean().default(true), builtIn: z.boolean().default(false) }),
)
export type ChannelSettingDto = z.output<typeof channelSettingSchema>

/** `GET /distribution`: the feed first (built in), then the registered channels. Addresses are built by the web. */
export const distributionOverviewSchema = z.preprocess(
  (raw) => (Array.isArray(raw) ? { channels: raw } : raw),
  z.object({ channels: z.array(channelSettingSchema).default([]) }).loose(),
)
export type DistributionOverviewDto = z.output<typeof distributionOverviewSchema>
