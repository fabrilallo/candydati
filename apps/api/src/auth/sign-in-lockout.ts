/**
 * Per-account lockout for password sign-in, independent of the client address: the rate limit by IP stops one
 * machine, this one stops a botnet (or a spoofed address) guessing the password of one account.
 */
export interface SignInLockout {
  /** Milliseconds the account stays locked, or null when attempts are allowed. */
  lockedForMs(email: string): Promise<number | null>;
  recordFailure(email: string): Promise<void>;
  /** A successful sign-in forgets the failures. */
  recordSuccess(email: string): Promise<void>;
}

export const SIGN_IN_MAX_FAILURES = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const SIGN_IN_LOCK_MS = 15 * 60 * 1000;
/** Bounds memory against someone trying endless distinct addresses. */
const MAX_TRACKED_ACCOUNTS = 50_000;

interface Entry {
  readonly failures: readonly number[];
  readonly lockedUntil: number;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * In memory: correct for a single api instance. With several instances each one counts apart (the effective limit
 * is multiplied by the instance count), so a deployment with more than one api process should give this interface a
 * shared implementation (Postgres or Redis) behind the same three methods.
 */
export function createInMemorySignInLockout(now: () => number = Date.now): SignInLockout {
  const entries = new Map<string, Entry>();

  const prune = (): void => {
    if (entries.size < MAX_TRACKED_ACCOUNTS) return;
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.lockedUntil <= current && entry.failures.every((at) => current - at >= SIGN_IN_WINDOW_MS)) entries.delete(key);
    }
    // Still full of live entries: forget the oldest ones (Map keeps insertion order).
    for (const key of entries.keys()) {
      if (entries.size < MAX_TRACKED_ACCOUNTS) break;
      entries.delete(key);
    }
  };

  return {
    async lockedForMs(email) {
      const entry = entries.get(normalizeEmail(email));
      const remaining = entry ? entry.lockedUntil - now() : 0;
      return remaining > 0 ? remaining : null;
    },
    async recordFailure(email) {
      const key = normalizeEmail(email);
      const current = now();
      const recent = [...(entries.get(key)?.failures ?? []), current].filter((at) => current - at < SIGN_IN_WINDOW_MS);
      const locked = recent.length >= SIGN_IN_MAX_FAILURES;
      prune();
      entries.delete(key); // re-inserted last: the oldest entries are the first to go when the map is full
      entries.set(key, { failures: locked ? [] : recent, lockedUntil: locked ? current + SIGN_IN_LOCK_MS : 0 });
    },
    async recordSuccess(email) {
      entries.delete(normalizeEmail(email));
    },
  };
}
