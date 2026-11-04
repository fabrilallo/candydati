import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleConnectedApps } from './drizzle-connected-apps.js';

let handle: DbHandle;
const NOW = new Date('2026-11-04T10:00:00.000Z');
const RESOURCE = 'https://ats.example.org/mcp';

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name: id, email: `${id}@x.it` });
  return id;
}

async function insertClient(name = 'Claude'): Promise<string> {
  const clientId = randomUUID();
  await handle.db.insert(schema.oauthClient).values({ id: randomUUID(), clientId, name, uri: 'https://claude.ai', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
  return clientId;
}

async function grantWithTokens(clientId: string, userId: string, organizationId: string, createdAt = NOW) {
  const id = randomUUID();
  await handle.db.insert(schema.oauthConsent).values({ id, clientId, userId, referenceId: organizationId, scopes: ['mcp', 'offline_access'], createdAt, updatedAt: createdAt });
  const refreshId = randomUUID();
  await handle.db.insert(schema.oauthRefreshToken).values({ id: refreshId, token: randomUUID(), clientId, userId, referenceId: organizationId, scopes: ['mcp'], expiresAt: NOW, createdAt: NOW });
  const hash = randomUUID();
  await handle.db.insert(schema.oauthAccessToken).values({ id: randomUUID(), token: hash, clientId, userId, referenceId: organizationId, refreshId, resources: [RESOURCE], scopes: ['mcp'], expiresAt: NOW, createdAt: NOW });
  return { id, hash };
}

describe('createDrizzleConnectedApps', () => {
  it('finds a token with its grant, lists and finds grants per organization, and revokes a grant with its tokens', async () => {
    const repo = createDrizzleConnectedApps(handle.db);
    const [ada, bob] = [await insertUser(), await insertUser()];
    const [orgA, orgB] = [randomUUID(), randomUUID()];
    const client = await insertClient();
    const older = await grantWithTokens(client, ada, orgA, new Date(NOW.getTime() - 1000));
    const bobs = await grantWithTokens(client, bob, orgA);
    const otherOrg = await grantWithTokens(client, ada, orgB);

    expect(await repo.findAccessToken(older.hash)).toEqual({
      grantId: older.id, organizationId: orgA, clientId: client, userId: ada, scopes: ['mcp'], resources: [RESOURCE], expiresAt: NOW, clientDisabled: false,
    });
    expect(await repo.findAccessToken('unknown')).toBeNull();
    expect((await repo.list(orgA, null)).map((g) => g.id)).toEqual([bobs.id, older.id]);
    expect((await repo.list(orgA, ada)).map((g) => g.id)).toEqual([older.id]);
    expect(await repo.findById(orgB, older.id)).toBeNull();
    expect(await repo.findGrant(orgA, client, ada)).toMatchObject({ id: older.id, clientName: 'Claude', clientUri: 'https://claude.ai', scopes: ['mcp', 'offline_access'] });

    await repo.revoke((await repo.findById(orgA, older.id))!);
    expect(await repo.findAccessToken(older.hash)).toBeNull();
    expect(await repo.findById(orgA, older.id)).toBeNull();
    // Only that grant: the same person in another organization, and someone else here, keep theirs.
    expect((await repo.findAccessToken(otherOrg.hash))?.grantId).toBe(otherOrg.id);
    expect((await repo.findAccessToken(bobs.hash))?.grantId).toBe(bobs.id);
  });

  it('ignores a token whose consent is gone, revoked or of another organization', async () => {
    const repo = createDrizzleConnectedApps(handle.db);
    const ada = await insertUser();
    const client = await insertClient();
    const org = randomUUID();
    const { id, hash } = await grantWithTokens(client, ada, org);
    await handle.db.update(schema.oauthAccessToken).set({ revoked: NOW }).where(eqToken(hash));
    expect(await repo.findAccessToken(hash)).toBeNull();
    await handle.db.update(schema.oauthAccessToken).set({ revoked: null, referenceId: randomUUID() }).where(eqToken(hash));
    expect(await repo.findAccessToken(hash)).toBeNull();
    expect(id).toBeTruthy();
  });

  it("finds an enabled client and lists a person's memberships with the organization name, by name", async () => {
    const repo = createDrizzleConnectedApps(handle.db);
    const client = await insertClient('Claude');
    expect(await repo.findClient(client)).toEqual({ clientId: client, name: 'Claude', uri: 'https://claude.ai', icon: null, redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(await repo.findClient('nope')).toBeNull();
    await handle.db.update(schema.oauthClient).set({ disabled: true }).where(eqClient(client));
    expect(await repo.findClient(client)).toBeNull();

    const ada = await insertUser();
    const [zeta, alpha] = [randomUUID(), randomUUID()];
    await handle.db.insert(schema.organization).values([{ id: zeta, name: 'Zeta', slug: zeta, createdAt: NOW }, { id: alpha, name: 'Alpha', slug: alpha, createdAt: NOW }]);
    await handle.db.insert(schema.member).values([
      { id: randomUUID(), organizationId: zeta, userId: ada, role: 'recruiter', createdAt: NOW },
      { id: randomUUID(), organizationId: alpha, userId: ada, role: 'interviewer,admin', createdAt: NOW },
    ]);
    expect(await repo.membershipsOf(ada)).toEqual([
      { organizationId: alpha, organizationName: 'Alpha', role: 'admin' },
      { organizationId: zeta, organizationName: 'Zeta', role: 'recruiter' },
    ]);
  });

  it('reports a disabled client', async () => {
    const repo = createDrizzleConnectedApps(handle.db);
    const ada = await insertUser();
    const client = await insertClient();
    const { hash } = await grantWithTokens(client, ada, randomUUID());
    await handle.db.update(schema.oauthClient).set({ disabled: true }).where(eqClient(client));
    expect((await repo.findAccessToken(hash))?.clientDisabled).toBe(true);
  });
});

const eqToken = (hash: string) => eq(schema.oauthAccessToken.token, hash);
const eqClient = (clientId: string) => eq(schema.oauthClient.clientId, clientId);
