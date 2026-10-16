import { z } from 'zod';
import { sanitizeCampaign, sanitizeOrigin } from './origin.js';

/** Daily visit counters older than this are deleted by the daily retention job (the longest report window is 800 days). */
export const VIEW_RETENTION_MONTHS = 25;

/**
 * Crawlers, link previewers, monitors and headless browsers: a visit from one of them is not counted. A beacon only comes
 * from a browser that ran the page's JavaScript, so this is the second line after "no JavaScript, no beacon".
 */
const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|headless|phantomjs|lighthouse|pagespeed|facebookexternalhit|preview|fetch|scrapy|python-requests|curl\/|wget\/|httpclient|okhttp|go-http-client|java\/|libwww|monitor|uptime|pingdom|datadog|node-fetch|axios|postmanruntime|http-?client/i;

/** An absent user agent is not a browser: browsers always send one. */
export const isBotUserAgent = (userAgent: string | undefined | null): boolean => {
  const value = (userAgent ?? '').trim();
  return value === '' || BOT_USER_AGENT.test(value);
};

/** The query of the visit beacon: raw labels, sanitized again here. */
export const jobViewQuerySchema = z.object({
  source: z.string().max(500).optional(),
  campaign: z.string().max(500).optional(),
});

/** The label pair a visit is counted under: `direct` and no campaign when nothing usable was sent. */
export const viewLabels = (raw: { readonly source?: unknown; readonly campaign?: unknown }): { readonly source: string; readonly campaign: string } => ({
  source: sanitizeOrigin(raw.source),
  campaign: sanitizeCampaign(raw.campaign),
});

/** `YYYY-MM-DD` in UTC: the day a visit is counted under. */
export const viewDay = (at: Date): string => at.toISOString().slice(0, 10);

/** The first day still kept: `months` calendar months before `now`'s day. */
export function viewRetentionCutoff(now: Date, months: number = VIEW_RETENTION_MONTHS): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
  return viewDay(day);
}

