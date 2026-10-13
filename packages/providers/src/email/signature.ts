import { createHmac, timingSafeEqual } from 'node:crypto';

export type HeaderBag = Readonly<Record<string, string | readonly string[] | undefined>>;
export type RawBody = string | Uint8Array;

export const SVIX_TOLERANCE_SECONDS = 300;

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : headers[key];
  return typeof value === 'string' ? value : value?.[0];
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Svix scheme used by Resend webhooks: HMAC-SHA256 base64 over `id.timestamp.body`, secret `whsec_<base64>`. */
export function verifyResendSignature(
  rawBody: RawBody,
  headers: HeaderBag,
  secret: string,
  now: Date = new Date(),
): boolean {
  const id = headerValue(headers, 'svix-id');
  const timestamp = headerValue(headers, 'svix-timestamp');
  const signatures = headerValue(headers, 'svix-signature');
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  return signatures.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    return version === 'v1' && value !== undefined && safeEqual(Buffer.from(value, 'base64'), expected);
  });
}

/** Generic webhook: how far in the past a timestamp may be (like Svix), and how far in the future (clock skew). */
export const HMAC_MAX_AGE_SECONDS = 300;
export const HMAC_MAX_FUTURE_SECONDS = 60;

const hmacOf = (secret: string, timestamp: string, rawBody: RawBody): Buffer =>
  createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();

/** The header value a sender computes: `sha256=<hex HMAC-SHA256 of "<timestamp>.<body>">`. `timestamp` is unix seconds. */
export const signHmacPayload = (rawBody: RawBody, timestamp: string, secret: string): string =>
  `sha256=${hmacOf(secret, timestamp, rawBody).toString('hex')}`;

/**
 * Generic webhook: `x-tt-signature: sha256=<hex>` over `<timestamp>.<raw body>`, with the unix-seconds timestamp in
 * `x-tt-timestamp`, secret used as-is. A timestamp older than 5 minutes or more than 1 minute ahead is refused, so a
 * captured request cannot be replayed later.
 */
export function verifyHmacSignature(
  rawBody: RawBody,
  header: string | undefined,
  secret: string,
  timestamp: string | undefined,
  now: Date = new Date(),
): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header?.trim() ?? '');
  if (!match?.[1] || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  const age = now.getTime() / 1000 - Number(timestamp);
  if (age > HMAC_MAX_AGE_SECONDS || age < -HMAC_MAX_FUTURE_SECONDS) return false;
  return safeEqual(Buffer.from(match[1], 'hex'), hmacOf(secret, timestamp, rawBody));
}
