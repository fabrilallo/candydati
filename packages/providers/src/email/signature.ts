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

/** Generic webhook: header `x-tt-signature: sha256=<hex>` over the raw body, secret used as-is. */
export function verifyHmacSignature(rawBody: RawBody, header: string | undefined, secret: string): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header?.trim() ?? '');
  if (!match?.[1]) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return safeEqual(Buffer.from(match[1], 'hex'), expected);
}
