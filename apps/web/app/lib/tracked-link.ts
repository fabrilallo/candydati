import { CAMPAIGN_NONE, ORIGIN_DIRECT, sanitizeCampaign, sanitizeOrigin } from '@candydati/domain'

/**
 * Channels a recruiter picks from when building a tracked link. The `source` is what `utm_source` carries and what the
 * Reports show; brands are proper names (no translation), the rest has an i18n label under `trackedLinks.presets`.
 */
export interface ChannelPreset {
  readonly source: string
  /** Proper name shown as is; absent: the label is `trackedLinks.presets.<source>`. */
  readonly name?: string
}

export const CHANNEL_PRESETS: readonly ChannelPreset[] = [
  { source: 'linkedin', name: 'LinkedIn' },
  { source: 'indeed', name: 'Indeed' },
  { source: 'infojobs', name: 'InfoJobs' },
  { source: 'glassdoor', name: 'Glassdoor' },
  { source: 'facebook', name: 'Facebook' },
  { source: 'instagram', name: 'Instagram' },
  { source: 'x', name: 'X' },
  { source: 'newsletter' },
  { source: 'referral' },
  { source: 'career-fair' },
  { source: 'university' },
]

/** The value of the "other channel" option of the channel select. */
export const CUSTOM_CHANNEL = '__custom'

export interface TrackedLink {
  /** The public ad URL with `utm_source` (and `utm_campaign`). */
  readonly url: string
  /** What is actually in the link: what the person typed, sanitized the way the reports will show it. */
  readonly source: string
  readonly campaign: string
}

export interface TrackedLinkInput {
  readonly jobUrl: string
  /** A preset's source, or whatever the person typed for another channel. */
  readonly source: string
  readonly campaign: string
}

/** The sanitized labels for what the person typed: shown next to the fields so nothing changes silently. */
export const trackedLabels = (input: Pick<TrackedLinkInput, 'source' | 'campaign'>): { readonly source: string | null; readonly campaign: string } => {
  const source = sanitizeOrigin(input.source)
  return { source: source === ORIGIN_DIRECT ? null : source, campaign: sanitizeCampaign(input.campaign) }
}

/** Null until there is a usable channel: a link with no source would be counted as direct, which is what the plain URL already is. */
export function buildTrackedLink(input: TrackedLinkInput): TrackedLink | null {
  const labels = trackedLabels(input)
  if (labels.source === null) return null
  try {
    const url = new URL(input.jobUrl)
    url.searchParams.set('utm_source', labels.source)
    if (labels.campaign !== CAMPAIGN_NONE) url.searchParams.set('utm_campaign', labels.campaign)
    return { url: url.toString(), source: labels.source, campaign: labels.campaign }
  } catch {
    return null
  }
}
