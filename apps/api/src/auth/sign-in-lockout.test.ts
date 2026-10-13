import { describe, expect, it } from 'vitest';
import { createInMemorySignInLockout, SIGN_IN_LOCK_MS, SIGN_IN_MAX_FAILURES, SIGN_IN_WINDOW_MS } from './sign-in-lockout.js';

const clock = () => {
  let at = 1_000_000;
  return { now: () => at, advance: (ms: number) => void (at += ms) };
};

const fail = async (lockout: ReturnType<typeof createInMemorySignInLockout>, email: string, times: number) => {
  for (let i = 0; i < times; i += 1) await lockout.recordFailure(email);
};

describe('sign-in lockout', () => {
  it('locks an account for 15 minutes after 10 failures, whatever the casing of the address', async () => {
    const time = clock();
    const lockout = createInMemorySignInLockout(time.now);
    await fail(lockout, 'Ada@Example.com', SIGN_IN_MAX_FAILURES - 1);
    expect(await lockout.lockedForMs('ada@example.com')).toBeNull();
    await lockout.recordFailure(' ada@example.com ');
    expect(await lockout.lockedForMs('ADA@example.com')).toBe(SIGN_IN_LOCK_MS);
    time.advance(SIGN_IN_LOCK_MS - 1);
    expect(await lockout.lockedForMs('ada@example.com')).toBe(1);
    time.advance(1);
    expect(await lockout.lockedForMs('ada@example.com')).toBeNull();
  });

  it('starts again from zero once the lock is over', async () => {
    const time = clock();
    const lockout = createInMemorySignInLockout(time.now);
    await fail(lockout, 'a@x.it', SIGN_IN_MAX_FAILURES);
    time.advance(SIGN_IN_LOCK_MS);
    await fail(lockout, 'a@x.it', SIGN_IN_MAX_FAILURES - 1);
    expect(await lockout.lockedForMs('a@x.it')).toBeNull();
  });

  it('counts only failures inside the 15 minute window', async () => {
    const time = clock();
    const lockout = createInMemorySignInLockout(time.now);
    await fail(lockout, 'a@x.it', SIGN_IN_MAX_FAILURES - 1);
    time.advance(SIGN_IN_WINDOW_MS);
    await lockout.recordFailure('a@x.it');
    expect(await lockout.lockedForMs('a@x.it')).toBeNull();
  });

  it('keeps accounts apart and forgets failures after a success', async () => {
    const lockout = createInMemorySignInLockout(clock().now);
    await fail(lockout, 'a@x.it', SIGN_IN_MAX_FAILURES - 1);
    await lockout.recordSuccess('a@x.it');
    await lockout.recordFailure('a@x.it');
    expect(await lockout.lockedForMs('a@x.it')).toBeNull();
    await fail(lockout, 'b@x.it', SIGN_IN_MAX_FAILURES);
    expect(await lockout.lockedForMs('b@x.it')).not.toBeNull();
    expect(await lockout.lockedForMs('a@x.it')).toBeNull();
  });
});
