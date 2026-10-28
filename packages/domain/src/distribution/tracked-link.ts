import { z } from 'zod';
import { ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL, sanitizeCampaign, sanitizeOrigin } from '../report/origin.js';

/**
 * A tracked link saved on a job: one channel (`utm_source`) and, optionally, a campaign (`utm_campaign`). Only the pair is
 * stored: the URL is built from the job's public address, so it follows the ad if its address changes.
 */
export interface TrackedLink {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  /** Sanitized like an application origin (`sanitizeOrigin`): what the reports show. */
  readonly source: string;
  /** Sanitized like `utm_campaign`; the empty string when the link carries no campaign. */
  readonly campaign: string;
  /** The person who saved it (never an API key or the agent itself). */
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** More than enough channels and campaigns for one ad; a bound keeps one job from growing without limit. */
export const TRACKED_LINKS_MAX = 100;

/** Raw text the person typed: sanitized afterwards, so only the length is bounded here. */
const RAW_LABEL_MAX = 200;

export const trackedLinkInputSchema = z.object({
  source: z.string().max(RAW_LABEL_MAX),
  campaign: z.string().max(RAW_LABEL_MAX).optional().default(''),
});
export type TrackedLinkInput = z.input<typeof trackedLinkInputSchema>;

/** Origins the product writes itself: a link carrying one would be counted as something it is not. */
const RESERVED_SOURCES: ReadonlySet<string> = new Set([ORIGIN_DIRECT, ORIGIN_IMPORT, ORIGIN_MANUAL]);

/**
 * The (source, campaign) pair a link is saved and counted under, sanitized the way the reports name it. Null when the
 * channel is empty, personal data or one of the origins the product reserves.
 */
export function trackedLinkKey(input: { readonly source: string; readonly campaign: string }): { readonly source: string; readonly campaign: string } | null {
  const source = sanitizeOrigin(input.source);
  if (RESERVED_SOURCES.has(source)) return null;
  return { source, campaign: sanitizeCampaign(input.campaign) };
}

// --- HTTP shape (dates as ISO strings) ---

export const trackedLinkSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  source: z.string(),
  campaign: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type TrackedLinkDto = z.infer<typeof trackedLinkSchema>;

export const trackedLinksSchema = z.array(trackedLinkSchema);

/** The answer of a save: the link, and whether it is new (false: the same pair was already saved). */
export const savedTrackedLinkSchema = z.object({ link: trackedLinkSchema, created: z.boolean() });
export type SavedTrackedLinkDto = z.infer<typeof savedTrackedLinkSchema>;

export const toTrackedLinkDto = (link: TrackedLink): TrackedLinkDto => ({
  id: link.id,
  jobId: link.jobId,
  source: link.source,
  campaign: link.campaign,
  createdAt: link.createdAt.toISOString(),
});
