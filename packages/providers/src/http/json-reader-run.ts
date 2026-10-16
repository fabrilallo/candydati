import type { BackoffOptions } from './json-reader-rate.js';
import { backoffMs, exhaustedWindowMs, retryAfterMs } from './json-reader-rate.js';
import { JsonReaderError, TransientFailure } from './json-reader-errors.js';
import { checkTarget, sameOrigin, type HostRule, type ReaderTarget } from './json-reader-hosts.js';
import { openExchange, pinnedAddresses, type Exchange, type RequestFn, type Resolve } from './json-reader-transport.js';
import { redactUrl } from './redact.js';

export interface JsonReaderEvent {
  readonly kind: 'request' | 'retry' | 'throttle';
  /** Always redacted: query values replaced, no user info. */
  readonly url: string;
  readonly attempt: number;
  readonly status?: number;
  readonly waitMs?: number;
}

/** Everything a run needs, defaults applied. */
export interface RunSettings {
  readonly allowedHosts: readonly HostRule[];
  readonly unsafe: boolean;
  readonly maxRetries: number;
  readonly backoff: BackoffOptions;
  readonly maxWaitMs: number;
  readonly resolve: Resolve;
  readonly transport: { readonly http: RequestFn; readonly https: RequestFn };
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly random: () => number;
  readonly onEvent: (event: JsonReaderEvent) => void;
  /** Token bucket: how long the next request must wait, in ms. */
  readonly take: () => number;
}

export interface RunRequest<T> {
  readonly url: string;
  /** Absent: a GET. `POST` carries `body` (the token exchange only); a POST is never redirected. */
  readonly method?: 'POST';
  readonly body?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  /** Turns a 2xx exchange into the result. */
  readonly consume: (exchange: Exchange) => Promise<T>;
  /** Whether a transient failure inside `consume` may still be retried (a download, only before its first byte). */
  readonly retryable: () => boolean;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

/** A final answer for a status that is neither a success nor worth retrying. */
const refusalFor = (status: number): JsonReaderError =>
  status === 401 || status === 403
    ? new JsonReaderError('credentials_refused', status)
    : status === 404
      ? new JsonReaderError('not_found', status)
      : new JsonReaderError('source_invalid_response', status);

/** Resolves once, pins, and follows redirects only within the same origin (at most three hops). */
async function send(s: RunSettings, target: ReaderTarget, request: RunRequest<unknown>): Promise<Exchange> {
  const { headers, timeoutMs } = request;
  const addresses = await pinnedAddresses(target.host, s.resolve, s.unsafe);
  const fn = target.secure ? s.transport.https : s.transport.http;
  let current = target;
  for (let hop = 0; ; hop += 1) {
    const exchange = await openExchange(fn, current, addresses, headers, timeoutMs, request.method === 'POST' ? { method: 'POST', body: request.body ?? '' } : undefined);
    if (!REDIRECTS.has(exchange.status)) return exchange;
    exchange.close();
    const location = exchange.headers.location;
    if (request.method === 'POST' || hop >= MAX_REDIRECTS || typeof location !== 'string') throw new JsonReaderError('redirect_refused', exchange.status);
    const next = new URL(location, current.url);
    if (!sameOrigin(current, next)) throw new JsonReaderError('redirect_refused', exchange.status);
    current = { ...current, url: next };
  }
}

interface Outcome<T> {
  readonly result?: { readonly value: T };
  readonly failure?: JsonReaderError;
  readonly waitMs?: number;
}

/**
 * Runs reads for one reader: shared throttling state (the token bucket, and a window the source said is spent), retries
 * with backoff on 429, 5xx, timeouts and broken connections. Events carry a redacted URL only.
 */
export function createRunner(s: RunSettings) {
  let blockedUntil = 0;

  const pause = async (waitMs: number, url: string, attempt: number): Promise<void> => {
    if (waitMs <= 0) return;
    if (waitMs > s.maxWaitMs) throw new JsonReaderError('source_rate_limited');
    s.onEvent({ kind: 'throttle', url, attempt, waitMs });
    await s.sleep(waitMs);
  };

  /** One attempt: a result, or the failure to retry with how long to wait first. Final refusals are thrown. */
  const attemptOnce = async <T>(target: ReaderTarget, request: RunRequest<T>, attempt: number): Promise<Outcome<T>> => {
    try {
      const exchange = await send(s, target, request);
      const window = exhaustedWindowMs(exchange.headers, s.now());
      if (window !== undefined) blockedUntil = s.now() + window;
      if (exchange.status >= 200 && exchange.status < 300) return { result: { value: await request.consume(exchange) } };
      exchange.close();
      if (exchange.status !== 429 && exchange.status < 500) throw refusalFor(exchange.status);
      const waitMs = retryAfterMs(exchange.headers, s.now()) ?? window ?? backoffMs(s.backoff, attempt, s.random);
      if (waitMs > s.maxWaitMs) throw new JsonReaderError('source_rate_limited', exchange.status);
      return { failure: new JsonReaderError(exchange.status === 429 ? 'source_rate_limited' : 'source_unavailable', exchange.status), waitMs };
    } catch (error) {
      if (!(error instanceof TransientFailure)) throw error;
      if (!request.retryable()) throw new JsonReaderError('source_unavailable');
      return { failure: new JsonReaderError('source_unavailable'), waitMs: backoffMs(s.backoff, attempt, s.random) };
    }
  };

  return async <T>(request: RunRequest<T>): Promise<T> => {
    const target = checkTarget(request.url, s.allowedHosts, s.unsafe);
    const url = redactUrl(request.url);
    for (let attempt = 1; ; attempt += 1) {
      await pause(s.take(), url, attempt);
      await pause(blockedUntil - s.now(), url, attempt);
      s.onEvent({ kind: 'request', url, attempt });
      const outcome = await attemptOnce(target, request, attempt);
      if (outcome.result) return outcome.result.value;
      const failure = outcome.failure ?? new JsonReaderError('source_unavailable');
      if (attempt > s.maxRetries) throw failure;
      const waitMs = outcome.waitMs ?? 0;
      s.onEvent({ kind: 'retry', url, attempt, waitMs, ...(failure.status === undefined ? {} : { status: failure.status }) });
      await s.sleep(waitMs);
    }
  };
}
