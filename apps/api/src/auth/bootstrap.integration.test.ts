import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase } from '../testing/test-database.js';
import { createOrganizationCreationLookups } from './organization-creation.js';
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

describe('bootstrap owner, recorded when the address is confirmed (L2)', () => {
  const account = async (email: string, emailVerified = false, createdAt = NOW) => {
    const row = { id: randomUUID(), name: 'U', email, emailVerified, createdAt, updatedAt: createdAt };
    await handle.db.insert(schema.user).values(row);
    return { id: row.id, email };
  };
  const later = (ms: number) => new Date(NOW.getTime() + ms);

  it('records the holder of the live claim as the first owner, and firstOwnerId returns it', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    const owner = await account('owner@example.test');
    expect(await lookups.claimBootstrap(owner.email, NOW)).toBe(true);
    expect(await lookups.confirmBootstrapOwner(owner, later(60_000))).toBe(true);
    await handle.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, owner.id));
    // Not the oldest confirmed account: the recorded owner wins anyway.
    await account('older@example.test', true, new Date('2020-01-01T00:00:00Z'));
    expect(await createOrganizationCreationLookups(handle.db).firstOwnerId()).toBe(owner.id);
  });

  it('refuses the holder of a lapsed claim', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    const squatter = await account('squatter@example.test');
    expect(await lookups.claimBootstrap(squatter.email, NOW)).toBe(true);
    expect(await lookups.confirmBootstrapOwner(squatter, later(BOOTSTRAP_CLAIM_TTL_MS + 1))).toBe(false);
  });

  it('refuses an account whose claim was taken over, once the new holder confirmed', async () => {
    await reset();
    const lookups = createSignupLookups(handle.db);
    const first = await account('first@example.test');
    const operator = await account('operator@example.test');
    expect(await lookups.claimBootstrap(first.email, NOW)).toBe(true);
    expect(await lookups.claimBootstrap(operator.email, later(BOOTSTRAP_CLAIM_TTL_MS + 1))).toBe(true);
    expect(await lookups.confirmBootstrapOwner(operator, later(BOOTSTRAP_CLAIM_TTL_MS + 2))).toBe(true);
    await handle.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, operator.id));
    expect(await lookups.confirmBootstrapOwner(first, later(BOOTSTRAP_CLAIM_TTL_MS + 3))).toBe(false);
    expect(await createOrganizationCreationLookups(handle.db).firstOwnerId()).toBe(operator.id);
  });

  it('without a bootstrap record (open sign-up, older installs) the first owner is the oldest confirmed account', async () => {
    await reset();
    const oldest = await account('oldest@example.test', true, new Date('2020-01-01T00:00:00Z'));
    await account('newer@example.test', true);
    expect(await createOrganizationCreationLookups(handle.db).firstOwnerId()).toBe(oldest.id);
  });
});
