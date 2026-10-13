import { careersUrl, feedUrl, llmsTxtUrl } from '@tt/domain'
import { FEED_CHANNEL_IDS, type DistributionStatus, type JobChannelDto } from './phase7-contract'

/** Public machine-readable addresses of an organization. Pure: the site URL is passed in, never read here. */
const trimmed = (siteUrl: string): string => siteUrl.replace(/\/+$/, '')
/** Stable path addresses come from the domain, the same ones the api and the feeds use. */
export { feedUrl }
export const llmsUrl = llmsTxtUrl
export const sitemapUrl = (siteUrl: string, org: string): string => `${careersUrl(siteUrl, org)}/sitemap.xml`
export const publicApiUrl = (siteUrl: string, org: string): string => `${trimmed(siteUrl)}/api/v1/public/organizations/${encodeURIComponent(org)}/jobs`
export const publicJobApiUrl = (siteUrl: string, org: string, jobSlug: string): string => `${publicApiUrl(siteUrl, org)}/${encodeURIComponent(jobSlug)}`

export const curlExample = (url: string): string => `curl -H 'Accept: application/json' '${url}'`

export type StatusTone = 'success' | 'secondary' | 'outline' | 'warning' | 'destructive'

const TONES: Readonly<Record<DistributionStatus, StatusTone>> = {
  feed: 'success',
  published: 'success',
  pending: 'warning',
  failed: 'destructive',
  removed: 'outline',
}

export const statusTone = (status: DistributionStatus): StatusTone => TONES[status]
export const statusLabelKey = (status: DistributionStatus): string => `distribution.status.${status}`

export interface ChannelRow {
  readonly id: string
  /** Registered channels bring their own label; the built-in rows use `labelKey`. */
  readonly label: string | null
  readonly labelKey: string | null
  readonly status: DistributionStatus | null
  readonly url: string | null
  readonly error: string | null
  readonly updatedAt: string | null
  /** Only registered channels can be synced again. */
  readonly syncable: boolean
  /** Copyable address (feed and public API rows). */
  readonly copyUrl: string | null
}

export const isFeedChannel = (row: Pick<JobChannelDto, 'channelId' | 'status'>): boolean => FEED_CHANNEL_IDS.includes(row.channelId) || row.status === 'feed'

/** The feed has no external state: published means "in the feed". */
const feedStatus = (status: DistributionStatus): DistributionStatus => (status === 'published' ? 'feed' : status)

export interface RowsInput {
  readonly channels: readonly JobChannelDto[]
  readonly published: boolean
  readonly feedUrl: string
  /** Null while the job has no slug yet. */
  readonly apiUrl: string | null
}

/**
 * Rows of the "Distribuzione" tab: the built-in feed first, then the registered channels, then the public API.
 * The feed row is computed from the job state when the api did not send it ("Nel feed XML" only while published).
 */
export const jobRows = (input: RowsInput): readonly ChannelRow[] => {
  const sent = input.channels.find(isFeedChannel)
  const feed: ChannelRow = {
    id: 'feed',
    label: null,
    labelKey: 'distribution.feed.label',
    status: sent ? feedStatus(sent.status) : input.published ? 'feed' : 'removed',
    url: null,
    error: null,
    updatedAt: sent?.updatedAt ?? null,
    syncable: false,
    copyUrl: input.feedUrl,
  }
  const registered: readonly ChannelRow[] = input.channels
    .filter((channel) => !isFeedChannel(channel))
    .map((channel) => ({
      id: channel.channelId,
      label: channel.label || channel.channelId,
      labelKey: null,
      status: channel.status,
      url: channel.url,
      error: channel.error,
      updatedAt: channel.updatedAt,
      syncable: true,
      copyUrl: null,
    }))
  const api: ChannelRow = { id: 'api', label: null, labelKey: 'distribution.api.label', status: null, url: null, error: null, updatedAt: null, syncable: false, copyUrl: input.apiUrl }
  return [feed, ...registered, ...(input.apiUrl ? [api] : [])]
}

/** True when at least one registered channel exists: decides whether the explanatory sentence is shown. */
export const hasRegisteredChannels = (rows: readonly ChannelRow[]): boolean => rows.some((row) => row.syncable)

/** Only an http(s) address becomes a link: a channel could send anything. */
export const safeExternalUrl = (url: string | null): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}
