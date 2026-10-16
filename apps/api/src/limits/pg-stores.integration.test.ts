import { randomUUID } from 'node:crypto';
import { createDb, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgThrottleStore } from '../auth/pg-throttle-store.js';
import { createSignInThrottle, NOTIFY_AFTER_FAILURES, PAIR_FREE_FAILURES } from '../auth/sign-in-throttle.js';
import { apiTestDatabaseUrl } from '../testing/test-database.js';
import { createDailyBudget, createPgBudgetStore } from './daily-budget.js';

let handle: DbHandle;
beforeAll(() => {
  handle = createDb(apiTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

describe('Postgres sign-in throttle store', () => {
  it('shares counters between two instances and resets the pair on success', async () => {
    let at = Date.now();
    const clock = () => at;
    const one = createSignInThrottle(createPgThrottleStore(handle.db, clock), clock);
    const two = createSignInThrottle(createPgThrottleStore(handle.db, clock), clock);
    const email = `${randomUUID()}@example.com`;
    for (let i = 0; i < PAIR_FREE_FAILURES; i += 1) await (i % 2 === 0 ? one : two).recordFailure(email, '10.0.0.1');
    expect(await one.waitMs(email, '10.0.0.1')).toBeNull();
    await two.recordFailure(email, '10.0.0.1');
    expect(await one.waitMs(email, '10.0.0.1')).toBe(1_000);
    at += 1_000;
    expect(await two.waitMs(email, '10.0.0.1')).toBeNull();
    await one.recordSuccess(email, '10.0.0.1');
    await two.recordFailure(email, '10.0.0.1');
    expect(await one.waitMs(email, '10.0.0.1')).toBeNull();
  });

  it('claims the owner notice once even when two instances race for it', async () => {
    const one = createSignInThrottle(createPgThrottleStore(handle.db));
    const two = createSignInThrottle(createPgThrottleStore(handle.db));
    const email = `${randomUUID()}@example.com`;
    const outcomes = await Promise.all(
      Array.from({ length: NOTIFY_AFTER_FAILURES + 4 }, (_, i) => (i % 2 === 0 ? one : two).recordFailure(email, `10.4.${i}.1`)),
    );
    expect(outcomes.filter((outcome) => outcome.notify)).toHaveLength(1);
  });
});

describe('Postgres daily budget store', () => {
  it('never spends past the limit, even under concurrent calls', async () => {
    const budget = createDailyBudget(createPgBudgetStore(handle.db));
    const line = { scope: 'test:budget', subject: randomUUID(), limit: 5 };
    const verdicts = await Promise.all(Array.from({ length: 12 }, () => budget.consume([line])));
    expect(verdicts.filter((verdict) => verdict.allowed)).toHaveLength(5);
    expect(verdicts.find((verdict) => !verdict.allowed)?.exhausted).toBe('test:budget');
  });
});
