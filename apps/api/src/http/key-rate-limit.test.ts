import { describe, expect, it } from 'vitest';
import { createKeyRateLimiter } from './key-rate-limit.js';

describe('createKeyRateLimiter', () => {
  it('allows `max` per window per key, then says how long to wait, and starts a new window', () => {
    let now = 1_000;
    const limiter = createKeyRateLimiter({ max: 2, windowMs: 60_000, now: () => now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterMs: 60_000 });
    expect(limiter.consume('b').allowed).toBe(true);
    now += 59_000;
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterMs: 1_000 });
    now += 1_000;
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it('charges a cost per request: a batch of tool calls spends one unit per call', () => {
    const limiter = createKeyRateLimiter({ max: 5, windowMs: 60_000, now: () => 1_000 });
    expect(limiter.consume('a', 4).allowed).toBe(true);
    expect(limiter.consume('a', 2).allowed).toBe(false);
    expect(limiter.consume('a').allowed).toBe(false);
  });
});
