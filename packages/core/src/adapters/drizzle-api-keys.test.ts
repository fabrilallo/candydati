import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import type { ApiKey } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { sha256Hex } from '../testing/in-memory-api-keys.js';
import { authenticateApiKey } from '../use-cases/api-keys/authenticate-api-key.js';
import { createDrizzleSecuritySettings } from './drizzle-security-settings.js';
import { createDrizzleTwoFactor } from './drizzle-two-factor.js';
import { createDrizzleApiKeys, createDrizzleMemberRoles, strongestRole } from './drizzle-api-keys.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00Z');

async function insertOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
}

async function insertMember(organizationId: string, role: string): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name: id, email: `${id}@x.it` });
  await handle.db.insert(schema.member).values({ id: randomUUID(), organizationId, userId: id, role, createdAt: new Date() });
  return id;
}

const key = (organizationId: string, createdBy: string, overrides: Partial<ApiKey> = {}): ApiKey => ({
  id: randomUUID(),
  organizationId,
  name: 'CI',
  prefix: randomUUID().replace(/-/g, '').slice(0, 8),
  hash: 'h',
  scopes: ['job:read'],
  createdBy,
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  revokedAt: null,
  ...overrides,
});

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzleApiKeys', () => {
  it('creates, finds by id (per organization) and by prefix, lists newest first, saves and touches', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    const repo = createDrizzleApiKeys(handle.db);
    const older = await repo.create(key(a, 'u', { createdAt: new Date('2026-05-01T00:00:00Z') }));
    const newer = await repo.create(key(a, 'u'));
    expect(await repo.findById(a, newer.id)).toEqual(newer);
    expect(await repo.findById(b, newer.id)).toBeNull();
    expect(await repo.findByPrefix(newer.prefix)).toEqual(newer);
    expect(await repo.findByPrefix('nope0000')).toBeNull();
    expect((await repo.list(a)).map((k) => k.id)).toEqual([newer.id, older.id]);
    expect(await repo.list(b)).toEqual([]);
    const revoked = await repo.save({ ...newer, revokedAt: NOW });
    expect(revoked.revokedAt).toEqual(NOW);
    await repo.touch(a, newer.id, NOW);
    await repo.touch(b, older.id, NOW);
    expect((await repo.findById(a, newer.id))?.lastUsedAt).toEqual(NOW);
    expect((await repo.findById(a, older.id))?.lastUsedAt).toBeNull();
  });

  it('fails to save a key of another organization', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    const repo = createDrizzleApiKeys(handle.db);
    const created = await repo.create(key(a, 'u'));
    await expect(repo.save({ ...created, organizationId: b })).rejects.toThrow();
  });
});

describe('createDrizzleMemberRoles', () => {
  it('reads the role in that organization only, the strongest of several', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    const user = await insertMember(a, 'interviewer,admin');
    const lookup = createDrizzleMemberRoles(handle.db);
    expect(await lookup.roleOf(a, user)).toBe('admin');
    expect(await lookup.roleOf(b, user)).toBeNull();
    expect(await lookup.roleOf(a, 'ghost')).toBeNull();
    expect(strongestRole('member')).toBeNull();
  });
});

describe('authenticateApiKey on Postgres', () => {
  it('follows the creator: demoted loses scopes, removed kills the key', async () => {
    const org = await insertOrg();
    const creator = await insertMember(org, 'owner');
    const repo = createDrizzleApiKeys(handle.db);
    const prefix = 'Ab12Cd34';
    const secret = `tt_${prefix}_${'x'.repeat(32)}`;
    await repo.create(key(org, creator, { prefix, hash: sha256Hex(secret), scopes: ['job:read', 'job:create', 'candidate:decide'] }));
    const deps = { apiKeys: repo, memberRoles: createDrizzleMemberRoles(handle.db), securitySettings: createDrizzleSecuritySettings(handle.db), twoFactor: createDrizzleTwoFactor(handle.db), hash: sha256Hex, now: () => NOW };
    expect((await authenticateApiKey(deps, secret))?.scopes).toEqual(['job:read', 'job:create']);
    // The organization requires 2FA: the owner's key is suspended until they turn it on.
    await deps.securitySettings.setRequireTwoFactor(org, true, NOW);
    expect(await authenticateApiKey(deps, secret)).toBeNull();
    await handle.pool.query(`update "user" set two_factor_enabled = true where id = $1`, [creator]);
    expect((await authenticateApiKey(deps, secret))?.scopes).toEqual(['job:read', 'job:create']);
    await handle.pool.query(`update member set role = 'interviewer' where user_id = $1`, [creator]);
    expect((await authenticateApiKey(deps, secret))?.scopes).toEqual(['job:read']);
    await handle.pool.query(`delete from member where user_id = $1`, [creator]);
    expect(await authenticateApiKey(deps, secret)).toBeNull();
  });
});
