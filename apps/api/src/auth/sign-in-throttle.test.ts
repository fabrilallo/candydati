import { describe, expect, it } from 'vitest';
import {
  createInMemoryThrottleStore,
  createSignInThrottle,
  delayFor,
  ACCOUNT_FREE_FAILURES,
  ACCOUNT_MAX_DELAY_MS,
  NOTIFY_AFTER_FAILURES,
  PAIR_FREE_FAILURES,
  PAIR_MAX_DELAY_MS,
  THROTTLE_WINDOW_MS,
} from './sign-in-throttle.js';

const clock = () => {
  let at = 1_000_000_000;
  return { now: () => at, advance: (ms: number) => void (at += ms) };
};

const setup = () => {
  const time = clock();
  const throttle = createSignInThrottle(createInMemoryThrottleStore(), time.now);
  const fail = async (email: string, ip: string, times: number) => {
    let last = { failures: 0, notify: false };
    for (let i = 0; i < times; i += 1) last = await throttle.recordFailure(email, ip);
    return last;
  };
  return { time, throttle, fail };
};

describe('delayFor', () => {
  it('is zero up to the free failures, then doubles from one second up to the cap', () => {
    expect(delayFor(5, 5, 300_000)).toBe(0);
    expect(delayFor(6, 5, 300_000)).toBe(1_000);
    expect(delayFor(7, 5, 300_000)).toBe(2_000);
    expect(delayFor(10, 5, 300_000)).toBe(16_000);
    expect(delayFor(60, 5, 300_000)).toBe(300_000);
  });
});

describe('sign-in throttle per (email, address)', () => {
  it('lets the first failures through, then waits longer after each one', async () => {
    const { time, throttle, fail } = setup();
    await fail('ada@x.it', '10.0.0.1', PAIR_FREE_FAILURES);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBeNull();
    await fail('Ada@X.it ', '10.0.0.1', 1);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBe(1_000);
    time.advance(1_000);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBeNull();
    await fail('ada@x.it', '10.0.0.1', 1);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBe(2_000);
  });

  it('never waits more than a few minutes, and a success resets the pair', async () => {
    const { throttle, fail } = setup();
    await fail('ada@x.it', '10.0.0.1', 40);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBe(PAIR_MAX_DELAY_MS);
    await throttle.recordSuccess('ada@x.it', '10.0.0.1');
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBeNull();
  });

  it('forgets failures after a quiet window', async () => {
    const { time, throttle, fail } = setup();
    await fail('ada@x.it', '10.0.0.1', PAIR_FREE_FAILURES + 3);
    time.advance(THROTTLE_WINDOW_MS);
    await fail('ada@x.it', '10.0.0.1', 1);
    expect(await throttle.waitMs('ada@x.it', '10.0.0.1')).toBeNull();
  });
});

describe('sign-in throttle per account', () => {
  it('slows every new address once the account has many failures, capped at a few minutes', async () => {
    const { throttle, fail } = setup();
    for (let i = 0; i < ACCOUNT_FREE_FAILURES + 30; i += 1) await fail('ada@x.it', `10.1.${i}.1`, 1);
    expect(await throttle.waitMs('ada@x.it', '10.9.9.9')).toBe(ACCOUNT_MAX_DELAY_MS);
    expect(await throttle.waitMs('grace@x.it', '10.9.9.9')).toBeNull();
  });

  it('does not slow an address that signed in to the account before: the attacker cannot lock the owner out', async () => {
    const { throttle, fail } = setup();
    await throttle.recordSuccess('ada@x.it', '192.0.2.10');
    for (let i = 0; i < ACCOUNT_FREE_FAILURES + 30; i += 1) await fail('ada@x.it', `10.1.${i}.1`, 1);
    expect(await throttle.waitMs('ada@x.it', '10.9.9.9')).not.toBeNull();
    expect(await throttle.waitMs('ada@x.it', '192.0.2.10')).toBeNull();
  });

  it('asks to notify the owner once when the failures reach the threshold', async () => {
    const { time, fail } = setup();
    const notices: boolean[] = [];
    for (let i = 0; i < NOTIFY_AFTER_FAILURES + 5; i += 1) notices.push((await fail('ada@x.it', `10.2.${i}.1`, 1)).notify);
    expect(notices.filter(Boolean)).toHaveLength(1);
    expect(notices.indexOf(true)).toBe(NOTIFY_AFTER_FAILURES - 1);
    time.advance(60_000);
    expect((await fail('ada@x.it', '10.3.0.1', 1)).notify).toBe(false);
  });
});
