import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase } from '../testing/test-database.js';
import { BOOTSTRAP_CLAIM_TTL_MS, createSignupLookups } from './signup-policy.js';

/** A database of its own: the bootstrap is about an instance with no confirmed account at all. */
const URL_ = 'postgres://tt:tt@localhost:5434/team_tracker_api_bootstrap_test';
let handle: DbHandle;

beforeAll(async () => {
  await prepareTestDatabase(URL_);
  handle = createDb(URL_, 12);
});
afterAll(async () => {
  await handle.close();
});

const reset = async (): Promise<void> => {
  await handle.db.delete(schema.instanceBootstrap);
  await handle.db.delete(schema.user);
};
const NOW = new Date('2026-10-14T10:00:00Z');

describe('bootstrap claim (L1)', () => {
  it('lets exactly one of many concurrent first sign-ups through', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    const emails = Array.from({ length: 10 }, (_, i) => `racer-${i}@example.test`);
    const results = await Promise.all(emails.map((email) => lookups.claimBootstrap(email, NOW)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const claims = await handle.db.select().from(schema.instanceBootstrap);
    expect(claims).toHaveLength(1);
    expect(emails[results.indexOf(true)]).toBe(claims[0]!.email);
  });

  it('lets the same address sign up again, and another one only after the unconfirmed claim lapsed', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    expect(await lookups.claimBootstrap('first@example.test', NOW)).toBe(true);
    expect(await lookups.claimBootstrap('first@example.test', new Date(NOW.getTime() + 1000))).toBe(true);
    expect(await lookups.claimBootstrap('squatter@example.test', new Date(NOW.getTime() + 60_000))).toBe(false);
    expect(await lookups.claimBootstrap('operator@example.test', new Date(NOW.getTime() + 1000 + BOOTSTRAP_CLAIM_TTL_MS + 1))).toBe(true);
  });

  it('counts only confirmed accounts: an unconfirmed one does not close the bootstrap, a confirmed one does', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    const user = (emailVerified: boolean) => ({ id: randomUUID(), name: 'U', email: `${randomUUID()}@example.test`, emailVerified, createdAt: NOW, updatedAt: NOW });
    await handle.db.insert(schema.user).values(user(false));
    expect(await lookups.claimBootstrap('owner@example.test', NOW)).toBe(true);
    await handle.db.insert(schema.user).values(user(true));
    expect(await lookups.claimBootstrap('owner@example.test', NOW)).toBe(false);
  });
});
