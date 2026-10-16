import type { IncomingHttpHeaders } from 'node:http';

export interface RateOptions {
  /** Requests that may go out at once. */
  readonly capacity: number;
  readonly refillPerSecond: number;
}

/**
 * Token bucket shared by every request of one reader (one connector run). Reservations are taken synchronously, so
 * concurrent callers queue up instead of all waiting the same delay. Returns how long the caller must wait, in ms.
 */
export function createTokenBucket({ capacity, refillPerSecond }: RateOptions, now: () => number): () => number {
  if (!(capacity >= 1) || !(refillPerSecond > 0)) throw new Error('Invalid rate: capacity >= 1 and refillPerSecond > 0 are required.');
  let tokens = capacity;
  let last = now();
  return () => {
    const current = now();
    tokens = Math.min(capacity, tokens + ((current - last) / 1000) * refillPerSecond);
    last = current;
    tokens -= 1;
    return tokens >= 0 ? 0 : Math.ceil((-tokens / refillPerSecond) * 1000);
  };
}

const header = (headers: IncomingHttpHeaders, ...names: readonly string[]): string | undefined => {
  for (const name of names) {
    const value = headers[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
};

/** `Retry-After` in ms: delta seconds or an HTTP date. Undefined when absent or unreadable. */
export function retryAfterMs(headers: IncomingHttpHeaders, now: number): number | undefined {
  const value = header(headers, 'retry-after');
  if (value === undefined) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/**
 * When the source says the window is spent (`X-RateLimit-Remaining: 0` or `X-Rate-Limit-Remaining: 0`), how long until
 * it resets, in ms: `*-Reset` as delta seconds, or as epoch seconds when it is larger than 1e9. Undefined otherwise.
 */
export function exhaustedWindowMs(headers: IncomingHttpHeaders, now: number): number | undefined {
  const remaining = header(headers, 'x-ratelimit-remaining', 'x-rate-limit-remaining');
  if (remaining === undefined || Number(remaining) > 0 || !/^\d+$/.test(remaining)) return undefined;
  const reset = header(headers, 'x-ratelimit-reset', 'x-rate-limit-reset');
  if (reset === undefined || !/^\d+(\.\d+)?$/.test(reset)) return undefined;
  const value = Number(reset);
  return value > 1e9 ? Math.max(0, value * 1000 - now) : value * 1000;
}

export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
}

/** Exponential backoff with jitter: between half and all of `base * 2^(attempt-1)`, capped. */
export const backoffMs = ({ baseMs, maxMs }: BackoffOptions, attempt: number, random: () => number): number =>
  Math.round(Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.5 + random() * 0.5));
