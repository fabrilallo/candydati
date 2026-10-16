/** Where an application came from: a short label, never a full URL and never personal data. */
export const ORIGIN_MAX = 60;
export const ORIGIN_DIRECT = 'direct';
export const ORIGIN_IMPORT = 'import';
export const ORIGIN_MANUAL = 'manual';

const HOST_PREFIX = /^www\./;

/** `https://user@www.linkedin.com:443/jobs/x?id=1` -> `linkedin.com`. Anything that is not a URL is returned unchanged. */
function hostOrSelf(value: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]*)/.exec(value);
  if (!match) return value;
  return (match[1] ?? '').replace(HOST_PREFIX, '');
}

/**
 * Lowercase, host only when a URL, characters limited to `a-z 0-9 . _ - ` (others become `-`), at most 60 characters.
 * Anything empty, not a string or containing an email address becomes `direct`.
 */
export function sanitizeOrigin(raw: unknown): string {
  return cleanLabel(raw) ?? ORIGIN_DIRECT;
}

/** Same rules as the origin, for `utm_campaign`. No campaign (empty, not a string, personal data) is the empty string. */
export const CAMPAIGN_MAX = ORIGIN_MAX;
export const CAMPAIGN_NONE = '';
export function sanitizeCampaign(raw: unknown): string {
  return cleanLabel(raw) ?? CAMPAIGN_NONE;
}

/** Longest raw value looked at: labels are short, and a bound keeps every step linear on hostile input. */
const RAW_MAX = 2_000;

const isEdge = (char: string): boolean => char === '-' || char === '.';

/** Drops `-` and `.` at both ends, in one pass (an anchored regex here backtracks quadratically). */
function trimEdges(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isEdge(value.charAt(start))) start += 1;
  while (end > start && isEdge(value.charAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const host = hostOrSelf(raw.slice(0, RAW_MAX).trim().toLowerCase());
  if (host === '' || host.includes('@')) return null;
  const cleaned = trimEdges(trimEdges(host.replace(/[^a-z0-9._-]+/g, '-')).slice(0, ORIGIN_MAX));
  return cleaned === '' ? null : cleaned;
}

/** Order of preference on the ad URL and the request: `utm_source`, then `ref`, then the referrer host, else `direct`. */
export function pickOrigin(candidates: { readonly utmSource?: string | undefined; readonly ref?: string | undefined; readonly referrer?: string | undefined }): string {
  for (const value of [candidates.utmSource, candidates.ref, candidates.referrer]) {
    const origin = sanitizeOrigin(value);
    if (origin !== ORIGIN_DIRECT) return origin;
  }
  return ORIGIN_DIRECT;
}
