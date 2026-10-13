import type { HttpPoster } from '@tt/core';

export interface HttpPosterOptions {
  readonly timeoutMs?: number | undefined;
  /** The response body is never used; at most this many bytes are drained so the connection can be reused. */
  readonly maxResponseBytes?: number | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export const DEFAULT_POST_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

async function discard(response: Response, maxBytes: number): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  let read = 0;
  try {
    while (read < maxBytes) {
      const { done, value } = await reader.read();
      if (done) return;
      read += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * `HttpPoster` over `fetch`. Redirects are NOT followed (`redirect: 'manual'`): a 3xx is returned as its status, which
 * the delivery counts as a failure. The timeout is enforced per request. Neither the request body nor the response body
 * is ever logged or returned; errors collapse to `timeout` or `network_error`, with no message that could echo a URL.
 */
export function createHttpPoster({
  timeoutMs = DEFAULT_POST_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  fetchImpl = fetch,
}: HttpPosterOptions = {}): HttpPoster {
  return {
    async post(request) {
      try {
        const response = await fetchImpl(request.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...request.headers },
          body: request.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(Math.min(request.timeoutMs, timeoutMs)),
        });
        await discard(response, maxResponseBytes);
        return { ok: true, status: response.status };
      } catch (error) {
        return { ok: false, error: isTimeout(error) ? 'timeout' : 'network_error' };
      }
    },
  };
}
