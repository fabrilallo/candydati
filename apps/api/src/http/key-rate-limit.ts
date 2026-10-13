export interface KeyRateLimiterOptions {
  readonly max: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface KeyRateLimiter {
  /** Counts one request of `keyId`; `retryAfterMs` is 0 when allowed. */
  consume(keyId: string): { readonly allowed: boolean; readonly retryAfterMs: number };
}

const MAX_TRACKED_KEYS = 10_000;

/**
 * Fixed window per API key id, on top of the per-client limit of the whole API: a leaked key cannot spend the budget of
 * the rest of the organization. In memory, per process, like the limiter it complements.
 */
export function createKeyRateLimiter({ max, windowMs, now = Date.now }: KeyRateLimiterOptions): KeyRateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const prune = (at: number): void => {
    for (const [id, window] of windows) if (window.resetAt <= at) windows.delete(id);
  };
  return {
    consume(keyId) {
      const at = now();
      if (windows.size >= MAX_TRACKED_KEYS) prune(at);
      const current = windows.get(keyId);
      const window = current && current.resetAt > at ? current : { count: 0, resetAt: at + windowMs };
      const next = { ...window, count: window.count + 1 };
      windows.set(keyId, next);
      return next.count > max ? { allowed: false, retryAfterMs: next.resetAt - at } : { allowed: true, retryAfterMs: 0 };
    },
  };
}
