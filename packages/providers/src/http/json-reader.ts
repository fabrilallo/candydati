import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { z } from 'zod';
import { JsonReaderError, TransientFailure } from './json-reader-errors.js';
import { hostRuleFor, type HostRule } from './json-reader-hosts.js';
import { createTokenBucket, type BackoffOptions, type RateOptions } from './json-reader-rate.js';
import { createRunner, type JsonReaderEvent, type RunSettings } from './json-reader-run.js';
import { readCapped, type Exchange, type RequestFn, type Resolve } from './json-reader-transport.js';

export interface JsonReaderOptions {
  /** The vendor's API hosts, and nothing else. Checked at creation. */
  readonly allowedHosts: readonly HostRule[];
  /** Whole exchange of one JSON page, body included. */
  readonly timeoutMs?: number | undefined;
  /** Whole exchange of one file download. */
  readonly downloadTimeoutMs?: number | undefined;
  readonly maxResponseBytes?: number | undefined;
  readonly maxDownloadBytes?: number | undefined;
  /** Retries after the first attempt, for 429, 5xx, timeouts and broken connections. */
  readonly maxRetries?: number | undefined;
  readonly backoff?: BackoffOptions | undefined;
  /** Longest single wait accepted (Retry-After, a spent rate window); beyond it the read fails `source_rate_limited`. */
  readonly maxWaitMs?: number | undefined;
  /** Token bucket shared by every request of this reader (one connector run). */
  readonly rate?: RateOptions | undefined;
  readonly resolve?: Resolve | undefined;
  readonly transport?: { readonly http: RequestFn; readonly https: RequestFn } | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly random?: (() => number) | undefined;
  /** Request, retry and throttle notices, with a redacted URL: safe to log. */
  readonly onEvent?: ((event: JsonReaderEvent) => void) | undefined;
  /** TESTS ONLY: accepts http, any port and private or loopback addresses. Never set it in production code. */
  readonly unsafeAllowLoopbackForTests?: boolean | undefined;
}

export interface RequestExtras {
  readonly headers?: Readonly<Record<string, string>>;
}

export interface JsonPage<T> {
  readonly data: T;
  /** Response headers, lowercase names (pagination links, rate-limit counters). */
  readonly headers: Readonly<Record<string, string>>;
}

export interface DownloadResult {
  readonly bytes: number;
  readonly mediaType: string | null;
}

/** `FileStorage.putStream` with its key bound: stores what `source` yields, nothing when it throws. */
export type DownloadStore = (source: AsyncIterable<Uint8Array>, mediaType: string | null) => Promise<number>;

export interface JsonReader {
  getJson<S extends z.ZodType>(url: string, schema: S, extras?: RequestExtras): Promise<JsonPage<z.output<S>>>;
  /**
   * The ONE write the reader makes: an OAuth token exchange. A form POST (`application/x-www-form-urlencoded`) to a host
   * of the allowlist, with the same pinning, caps, redaction and error mapping as `getJson`; never redirected. The
   * response is validated by `schema`; the form and the response are never logged or put in an error.
   */
  postForm<S extends z.ZodType>(url: string, form: Readonly<Record<string, string>>, schema: S, extras?: RequestExtras): Promise<JsonPage<z.output<S>>>;
  download(url: string, store: DownloadStore, extras?: RequestExtras): Promise<DownloadResult>;
}

export const JSON_READER_DEFAULTS = {
  timeoutMs: 30_000,
  downloadTimeoutMs: 10 * 60_000,
  maxResponseBytes: 5 * 1024 * 1024,
  maxDownloadBytes: 100 * 1024 * 1024,
  maxRetries: 4,
  backoff: { baseMs: 500, maxMs: 30_000 },
  maxWaitMs: 120_000,
} as const;

const resolveAll: Resolve = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
const realSleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const runSettings = (o: JsonReaderOptions): RunSettings => {
  const now = o.now ?? Date.now;
  return {
    allowedHosts: o.allowedHosts.map(hostRuleFor),
    unsafe: o.unsafeAllowLoopbackForTests === true,
    maxRetries: o.maxRetries ?? JSON_READER_DEFAULTS.maxRetries,
    backoff: o.backoff ?? JSON_READER_DEFAULTS.backoff,
    maxWaitMs: o.maxWaitMs ?? JSON_READER_DEFAULTS.maxWaitMs,
    resolve: o.resolve ?? resolveAll,
    transport: o.transport ?? { http: httpRequest, https: httpsRequest },
    sleep: o.sleep ?? realSleep,
    now,
    random: o.random ?? Math.random,
    onEvent: o.onEvent ?? (() => undefined),
    take: o.rate ? createTokenBucket(o.rate, now) : () => 0,
  };
};

const flatHeaders = (headers: IncomingHttpHeaders): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => (value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]])));

const requestHeaders = (accept: string, extras: RequestExtras | undefined): Readonly<Record<string, string>> => ({
  accept,
  'user-agent': 'candydati-migration',
  ...extras?.headers,
});

async function parsePage<S extends z.ZodType>(exchange: Exchange, schema: S, maxBytes: number): Promise<JsonPage<z.output<S>>> {
  const body = await readCapped(exchange, maxBytes);
  let json: unknown;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch {
    throw new JsonReaderError('source_invalid_response', exchange.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new JsonReaderError('source_invalid_response', exchange.status);
  return { data: parsed.data, headers: flatHeaders(exchange.headers) };
}

const mediaTypeOf = (headers: IncomingHttpHeaders): string | null => {
  const type = headers['content-type'];
  return typeof type === 'string' ? (type.split(';')[0]?.trim().toLowerCase() ?? null) : null;
};

/** The body as handed to storage: stops (throwing, so nothing is stored) past `maxBytes`; reports each byte handed out. */
async function* cappedBody(exchange: Exchange, maxBytes: number, onDelivered: () => void): AsyncGenerator<Uint8Array> {
  let size = 0;
  const iterator = exchange.body[Symbol.asyncIterator]();
  for (;;) {
    let next: IteratorResult<Uint8Array>;
    try {
      next = await iterator.next();
    } catch {
      throw new TransientFailure(exchange.timedOut() ? 'timeout' : 'network');
    }
    if (next.done) return;
    size += next.value.length;
    if (size > maxBytes) {
      exchange.close();
      throw new JsonReaderError('source_invalid_response', exchange.status);
    }
    onDelivered();
    yield next.value;
  }
}

async function storeDownload(exchange: Exchange, store: DownloadStore, maxBytes: number, onDelivered: () => void): Promise<DownloadResult> {
  const declared = Number(exchange.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    exchange.close();
    throw new JsonReaderError('source_invalid_response', exchange.status);
  }
  const mediaType = mediaTypeOf(exchange.headers);
  const bytes = await store(cappedBody(exchange, maxBytes, onDelivered), mediaType);
  exchange.close();
  return { bytes, mediaType };
}

/**
 * Reads a vendor's JSON API for a migration connector (ADR 0009, Task 6.1). GET only. Every request: host in the
 * connector's allowlist, https on the default port, resolved once and pinned to public addresses (no DNS rebinding),
 * redirects only within the same origin, a timeout over the whole exchange, a capped body, JSON checked by the caller's
 * Zod schema. Throttled by a token bucket and by the source's own rate-limit headers; 429, 5xx and broken connections
 * are retried with backoff. Nothing it throws or reports carries a URL query, a header or a body. Files stream to
 * storage under their own cap and are retried only before their first byte.
 */
export function createJsonReader(options: JsonReaderOptions): JsonReader {
  const run = createRunner(runSettings(options));
  const timeoutMs = options.timeoutMs ?? JSON_READER_DEFAULTS.timeoutMs;
  const downloadTimeoutMs = options.downloadTimeoutMs ?? JSON_READER_DEFAULTS.downloadTimeoutMs;
  const maxResponseBytes = options.maxResponseBytes ?? JSON_READER_DEFAULTS.maxResponseBytes;
  const maxDownloadBytes = options.maxDownloadBytes ?? JSON_READER_DEFAULTS.maxDownloadBytes;
  return {
    getJson: (url, schema, extras) =>
      run({ url, headers: requestHeaders('application/json', extras), timeoutMs, consume: (exchange) => parsePage(exchange, schema, maxResponseBytes), retryable: () => true }),
    postForm: (url, form, schema, extras) =>
      run({ url, method: 'POST', body: new URLSearchParams(form).toString(), headers: requestHeaders('application/json', extras), timeoutMs, consume: (exchange) => parsePage(exchange, schema, maxResponseBytes), retryable: () => true }),
    download: (url, store, extras) => {
      let delivered = false;
      const consume = (exchange: Exchange) => storeDownload(exchange, store, maxDownloadBytes, () => { delivered = true; });
      return run({ url, headers: requestHeaders('*/*', extras), timeoutMs: downloadTimeoutMs, consume, retryable: () => !delivered });
    },
  };
}

export { JsonReaderError, type JsonReaderErrorCode } from './json-reader-errors.js';
export { hostRuleFor, type HostRule } from './json-reader-hosts.js';
export type { JsonReaderEvent } from './json-reader-run.js';
export type { RateOptions, BackoffOptions } from './json-reader-rate.js';
