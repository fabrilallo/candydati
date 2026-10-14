import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { apiKey, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

let handle: DbHandle;

async function insertOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
}

const keyValues = (organizationId: string, overrides: Partial<typeof apiKey.$inferInsert> = {}): typeof apiKey.$inferInsert => ({
  id: randomUUID(),
  organizationId,
  name: 'CI',
  prefix: randomUUID().slice(0, 8),
  hash: 'h',
  scopes: ['job:read'],
  createdBy: 'user_1',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  ...overrides,
});

describe('api_key table', () => {
  beforeAll(async () => {
    const url = testDatabaseUrl();
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('refuses a key without an expiry: every key expires', async () => {
    const org = await insertOrg();
    await expect(handle.db.insert(apiKey).values({ ...keyValues(org), expiresAt: undefined as never })).rejects.toThrow();
  });

  it('stores a key with scopes and null usage and revocation dates by default', async () => {
    const org = await insertOrg();
    const values = keyValues(org, { scopes: ['job:read', 'job:create'] });
    await handle.db.insert(apiKey).values(values);
    const found = (await handle.db.select().from(apiKey).where(eq(apiKey.id, values.id))).at(0);
    expect(found).toMatchObject({ scopes: ['job:read', 'job:create'], lastUsedAt: null, expiresAt: new Date('2030-01-01T00:00:00Z'), revokedAt: null });
  });

  it('keeps the prefix unique across organizations', async () => {
    const [a, b] = [await insertOrg(), await insertOrg()];
    await handle.db.insert(apiKey).values(keyValues(a, { prefix: 'Dup12345' }));
    await expect(handle.db.insert(apiKey).values(keyValues(b, { prefix: 'Dup12345' }))).rejects.toThrow();
  });

  it('requires an existing organization', async () => {
    await expect(handle.db.insert(apiKey).values(keyValues('nope'))).rejects.toThrow();
  });
});
