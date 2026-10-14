/**
 * Failed password sign-ins slow down further attempts instead of locking the account:
 * - per (email, client address): after PAIR_FREE_FAILURES, each failure doubles the wait from 1 s up to PAIR_MAX_DELAY_MS;
 * - per account, across addresses (a botnet): after ACCOUNT_FREE_FAILURES the same, capped at ACCOUNT_MAX_DELAY_MS, and
 *   NOT applied to an address that signed in to that account successfully before (so whoever floods the account cannot
 *   keep its owner out);
 * - a success resets the pair; counters are forgotten after THROTTLE_WINDOW_MS without failures;
 * - at NOTIFY_AFTER_FAILURES the owner is told by email, at most once per NOTIFY_COOLDOWN_MS.
 * The counters live in a store shared by every api instance (Postgres); the in-memory store is for tests and single runs.
 */

export const PAIR_FREE_FAILURES = 5;
export const PAIR_MAX_DELAY_MS = 5 * 60 * 1000;
export const ACCOUNT_FREE_FAILURES = 20;
export const ACCOUNT_MAX_DELAY_MS = 2 * 60 * 1000;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const NOTIFY_AFTER_FAILURES = 10;
export const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;
/** An address that signed in successfully stays "known" for this long. */
export const KNOWN_ADDRESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BASE_DELAY_MS = 1_000;

export interface ThrottleCounter {
  readonly failures: number;
  readonly lastAt: number;
  readonly notifiedAt: number | null;
}

/** Storage of the counters. Every write is atomic per key, so concurrent instances never lose a failure. */
export interface ThrottleStore {
  read(keys: readonly string[]): Promise<ReadonlyMap<string, ThrottleCounter>>;
  /** +1 on each key (starting again from 1 when the last failure is older than `windowMs`); the counters after it. */
  addFailure(keys: readonly string[], now: number, windowMs: number): Promise<ReadonlyMap<string, ThrottleCounter>>;
  /** Sets `notifiedAt` when it is unset or older than `cooldownMs`; true only for the caller that set it. */
  claimNotice(key: string, now: number, cooldownMs: number): Promise<boolean>;
  /** Records a successful sign-in from an address (`known:` key). */
  remember(key: string, now: number): Promise<void>;
  clear(keys: readonly string[]): Promise<void>;
}

export interface FailureOutcome {
  /** Failures of the account in the current window. */
  readonly failures: number;
  /** True exactly once per cooldown when the account crosses the notice threshold: email the owner. */
  readonly notify: boolean;
}

/** Same three steps as before (check, record failure, record success), now per (email, address). */
export interface SignInThrottle {
  /** Milliseconds to wait before this attempt is allowed, or null. */
  waitMs(email: string, ip: string): Promise<number | null>;
  recordFailure(email: string, ip: string): Promise<FailureOutcome>;
  recordSuccess(email: string, ip: string): Promise<void>;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** 0 up to `free` failures, then 1 s, 2 s, 4 s... up to `cap`. */
export const delayFor = (failures: number, free: number, cap: number): number => {
  if (failures <= free) return 0;
  const exponent = Math.min(failures - free - 1, 30);
  return Math.min(BASE_DELAY_MS * 2 ** exponent, cap);
};

const keysOf = (email: string, ip: string) => {
  const account = normalizeEmail(email);
  return { pair: `pair:${account}|${ip}`, account: `email:${account}`, known: `known:${account}|${ip}` };
};

const remaining = (counter: ThrottleCounter | undefined, free: number, cap: number, now: number): number => {
  if (!counter || now - counter.lastAt >= THROTTLE_WINDOW_MS) return 0;
  return Math.max(0, counter.lastAt + delayFor(counter.failures, free, cap) - now);
};

export function createSignInThrottle(store: ThrottleStore, now: () => number = Date.now): SignInThrottle {
  return {
    async waitMs(email, ip) {
      const keys = keysOf(email, ip);
      const counters = await store.read([keys.pair, keys.account, keys.known]);
      const at = now();
      const known = counters.get(keys.known);
      const isKnown = known !== undefined && at - known.lastAt < KNOWN_ADDRESS_TTL_MS;
      const pairWait = remaining(counters.get(keys.pair), PAIR_FREE_FAILURES, PAIR_MAX_DELAY_MS, at);
      const accountWait = isKnown ? 0 : remaining(counters.get(keys.account), ACCOUNT_FREE_FAILURES, ACCOUNT_MAX_DELAY_MS, at);
      const wait = Math.max(pairWait, accountWait);
      return wait > 0 ? wait : null;
    },
    async recordFailure(email, ip) {
      const keys = keysOf(email, ip);
      const at = now();
      const counters = await store.addFailure([keys.pair, keys.account], at, THROTTLE_WINDOW_MS);
      const failures = counters.get(keys.account)?.failures ?? 0;
      const notify = failures >= NOTIFY_AFTER_FAILURES && (await store.claimNotice(keys.account, at, NOTIFY_COOLDOWN_MS));
      return { failures, notify };
    },
    async recordSuccess(email, ip) {
      const keys = keysOf(email, ip);
      await store.clear([keys.pair]);
      await store.remember(keys.known, now());
    },
  };
}

/** Bounds memory against endless distinct emails and addresses. */
const MAX_TRACKED_KEYS = 100_000;

/** One process only: tests, and a single api instance that does not want the table. */
export function createInMemoryThrottleStore(): ThrottleStore {
  const counters = new Map<string, ThrottleCounter>();
  const put = (key: string, counter: ThrottleCounter): void => {
    if (counters.size >= MAX_TRACKED_KEYS && !counters.has(key)) {
      const oldest = counters.keys().next().value;
      if (oldest !== undefined) counters.delete(oldest);
    }
    counters.delete(key); // re-inserted last: the oldest keys are the first to go
    counters.set(key, counter);
  };
  return {
    async read(keys) {
      return new Map(keys.flatMap((key) => (counters.has(key) ? [[key, counters.get(key)!] as const] : [])));
    },
    async addFailure(keys, at, windowMs) {
      for (const key of keys) {
        const current = counters.get(key);
        const fresh = !current || at - current.lastAt >= windowMs;
        put(key, { failures: fresh ? 1 : current.failures + 1, lastAt: at, notifiedAt: current?.notifiedAt ?? null });
      }
      return this.read(keys);
    },
    async claimNotice(key, at, cooldownMs) {
      const current = counters.get(key);
      if (!current || (current.notifiedAt !== null && at - current.notifiedAt < cooldownMs)) return false;
      put(key, { ...current, notifiedAt: at });
      return true;
    },
    async remember(key, at) {
      put(key, { failures: 0, lastAt: at, notifiedAt: null });
    },
    async clear(keys) {
      for (const key of keys) counters.delete(key);
    },
  };
}
