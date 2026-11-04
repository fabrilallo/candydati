import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, type World } from '../testing/candidate-world.js';
import { createKey, withKey } from '../testing/api-keys.js';
import { CLAUDE_CALLBACK, MCP_RESOURCE, authorize, codeOf, connect, consent, consentQueryOf, newPkce, registerClient, registeredClientId, token } from '../testing/oauth-flow.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from '../testing/test-app.js';

let t: TestApp;
let world: World;

beforeAll(async () => {
  t = await createTestApp();
  world = await createWorld(t, 'OAuth Org');
});
afterAll(async () => {
  await t.close();
});

const rpc = (method: string, id = 1, params: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id, method, params });
const INIT = rpc('initialize', 1, { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude', version: '1' } });

async function mcp(bearer: string | null, body: unknown = rpc('tools/list')) {
  return t.app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    payload: body as object,
  });
}

describe('discovery', () => {
  it('serves the protected resource metadata of /mcp, pointing to the authorization server', async () => {
    for (const url of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const reply = await t.app.inject({ method: 'GET', url });
      expect(reply.statusCode, url).toBe(200);
      expect(JSON.parse(reply.body)).toMatchObject({ resource: MCP_RESOURCE, authorization_servers: [`${WEB_ORIGIN}/api/auth`], bearer_methods_supported: ['header'], scopes_supported: ['mcp'] });
    }
  });

  it('serves the authorization server metadata with PKCE S256 and registration', async () => {
    for (const url of ['/.well-known/oauth-authorization-server/api/auth', '/.well-known/oauth-authorization-server']) {
      const reply = await t.app.inject({ method: 'GET', url });
      expect(reply.statusCode, url).toBe(200);
      const body = JSON.parse(reply.body) as Record<string, unknown>;
      expect(body).toMatchObject({
        issuer: `${WEB_ORIGIN}/api/auth`,
        authorization_endpoint: `${WEB_ORIGIN}/api/auth/oauth2/authorize`,
        token_endpoint: `${WEB_ORIGIN}/api/auth/oauth2/token`,
        registration_endpoint: `${WEB_ORIGIN}/api/auth/oauth2/register`,
        code_challenge_methods_supported: ['S256'],
      });
      expect(body.grant_types_supported).not.toContain('client_credentials');
    }
  });
});

describe('the 401 challenge', () => {
  it('names the protected resource metadata without credentials, and says invalid_token with bad ones', async () => {
    const missing = await mcp(null, INIT);
    expect(missing.statusCode).toBe(401);
    expect(missing.headers['www-authenticate']).toBe(`Bearer resource_metadata="${WEB_ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="mcp"`);
    const invalid = await mcp(`candydati_oat_${'A'.repeat(32)}`, INIT);
    expect(invalid.statusCode).toBe(401);
    expect(invalid.headers['www-authenticate']).toMatch(/^Bearer error="invalid_token", resource_metadata=/);
  });
});

describe('client registration', () => {
  it("accepts Claude's callback and refuses any other, and the client credentials grant", async () => {
    expect((await registerClient(t.app)).statusCode).toBe(201);
    const evil = await registerClient(t.app, { redirect_uris: ['https://evil.example/callback'] });
    expect(evil.statusCode).toBe(400);
    expect(evil.body).toMatch(/invalid_redirect_uri/);
    expect((await registerClient(t.app, { redirect_uris: [CLAUDE_CALLBACK, 'http://127.0.0.1:5555/cb'] })).statusCode).toBe(400);
    expect((await registerClient(t.app, { grant_types: ['client_credentials'] })).statusCode).toBe(400);
    // A self-registered app can never skip the consent page.
    expect((await registerClient(t.app, { skip_consent: true })).statusCode).toBe(400);
  });

  it('does not route client or consent management endpoints', async () => {
    for (const url of ['/api/auth/oauth2/create-client', '/api/auth/oauth2/get-consents', '/api/auth/oauth2/userinfo', '/api/auth/admin/oauth2/create-client']) {
      const reply = await world.owner.post(url, {});
      expect(reply.status, url).toBe(404);
    }
  });
});

describe('the authorization code flow with PKCE', () => {
  it('connects, acts in the chosen organization with the person role, and is audited', async () => {
    const recruiter = await world.member('recruiter');
    const clientId = await registeredClientId(t.app);
    const pkce = newPkce();
    const authorized = await authorize(t.app, recruiter, clientId, pkce);
    expect(authorized.statusCode).toBe(302);
    const oauthQuery = consentQueryOf(authorized.headers.location);

    const preview = await recruiter.post<{ client: { name: string; redirectUri: string }; organizations: { name: string; role: string; active: boolean }[] }>('/api/v1/connected-apps/consent-preview', { oauthQuery });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ client: { name: 'Claude', redirectUri: CLAUDE_CALLBACK }, organizations: [{ name: 'OAuth Org', role: 'recruiter', active: true }] });
    const tampered = await recruiter.post('/api/v1/connected-apps/consent-preview', { oauthQuery: oauthQuery.replace(`client_id=${clientId}`, 'client_id=other') });
    expect(tampered.status).toBe(422);

    const answered = await consent(recruiter, oauthQuery);
    const url = (answered.body as unknown as { url: string }).url;
    expect(url.startsWith(`${CLAUDE_CALLBACK}?`)).toBe(true);
    const code = codeOf(url)!;

    const wrongVerifier = await token(t.app, { grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CALLBACK, client_id: clientId, code_verifier: newPkce().verifier, resource: MCP_RESOURCE });
    expect(wrongVerifier.statusCode).toBe(400);
    // A code works once: the failed attempt above already consumed it.
    const replay = await token(t.app, { grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CALLBACK, client_id: clientId, code_verifier: pkce.verifier, resource: MCP_RESOURCE });
    expect(replay.statusCode).toBe(400);

    const tokens = await connect(t.app, recruiter, clientId);
    expect(tokens.access_token).toMatch(/^candydati_oat_/);
    expect(tokens.refresh_token).toMatch(/^candydati_ort_/);
    expect(tokens.expires_in).toBe(900);

    const listed = await mcp(tokens.access_token, rpc('tools/call', 2, { name: 'list_jobs', arguments: {} }));
    expect(listed.statusCode).toBe(200);
    expect(listed.body).toContain('Backend Developer');

    const apps = await recruiter.get<{ id: string; clientName: string }[]>('/api/v1/connected-apps');
    expect(apps.body.data).toEqual([expect.objectContaining({ clientName: 'Claude', scopes: ['mcp', 'offline_access'] })]);
    const audit = await world.owner.get<{ action: string; actor: { type: string } }[]>('/api/v1/audit-log?limit=50');
    const actions = (audit.body.data ?? []).map((event) => `${event.action}:${event.actor.type}`);
    expect(actions).toContain('connected_app.granted:user');
    expect(actions).toContain('mcp.read:connected_app');
  });

  it('never decides, messages or manages: the machine forbidden list holds, even for an owner', async () => {
    const tokens = await connect(t.app, world.owner);
    const tools = await mcp(tokens.access_token);
    expect(tools.statusCode).toBe(200);
    expect(tools.body).not.toMatch(/"name":"(move|decide|send|erase)/);
  });

  it('refreshes, and stops at once when the person revokes the connection', async () => {
    const hm = await world.member('hiring_manager');
    const tokens = await connect(t.app, hm);
    const refreshed = await token(t.app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: tokens.clientId, resource: MCP_RESOURCE });
    expect(refreshed.statusCode).toBe(200);
    const next = JSON.parse(refreshed.body) as { access_token: string; refresh_token: string };
    expect((await mcp(next.access_token)).statusCode).toBe(200);

    const [grant] = (await hm.get<{ id: string }[]>('/api/v1/connected-apps')).body.data!;
    expect((await hm.delete(`/api/v1/connected-apps/${grant!.id}`)).status).toBe(200);
    expect((await mcp(next.access_token)).statusCode).toBe(401);
    expect((await token(t.app, { grant_type: 'refresh_token', refresh_token: next.refresh_token, client_id: tokens.clientId })).statusCode).toBe(400);
    const audit = await world.owner.get<{ action: string }[]>('/api/v1/audit-log?limit=50');
    expect((audit.body.data ?? []).map((event) => event.action)).toContain('connected_app.revoked');
  });

  it("keeps a member's grant out of another member's reach, and lets an owner revoke it", async () => {
    const [ada, bob] = [await world.member('recruiter'), await world.member('recruiter')];
    const tokens = await connect(t.app, ada);
    const [grant] = (await ada.get<{ id: string }[]>('/api/v1/connected-apps')).body.data!;
    expect((await bob.get<unknown[]>('/api/v1/connected-apps')).body.data).toEqual([]);
    expect((await bob.delete(`/api/v1/connected-apps/${grant!.id}`)).status).toBe(404);
    expect((await mcp(tokens.access_token)).statusCode).toBe(200);
    expect((await world.owner.delete(`/api/v1/connected-apps/${grant!.id}`)).status).toBe(200);
    expect((await mcp(tokens.access_token)).statusCode).toBe(401);
  });
});

describe('organization binding', () => {
  it('acts only in the organization picked at consent, and dies when the person leaves it', async () => {
    const other = await createWorld(t, 'Other Org');
    const user = await world.member('recruiter');
    const tokens = await connect(t.app, user);
    // The person moves to another organization in the web app: the app still acts where it was connected.
    await user.joinAs(other.owner, 'recruiter');
    const orgs = (await user.get<{ id: string; name: string }[]>('/api/auth/organization/list')).body as unknown as { id: string; name: string }[];
    await user.post('/api/auth/organization/set-active', { organizationId: orgs.find((o) => o.name === 'Other Org')!.id });
    const listed = await mcp(tokens.access_token, rpc('tools/call', 3, { name: 'list_jobs', arguments: {} }));
    expect(listed.body).toContain('Backend Developer');
    const orgsOfWorld = (await world.owner.get('/api/auth/organization/list')).body as unknown as { id: string; name: string }[];
    const memberId = await memberIdOf(world, user.email);
    expect((await world.owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: memberId, organizationId: orgsOfWorld[0]!.id })).status).toBe(200);
    expect((await mcp(tokens.access_token)).statusCode).toBe(401);
  });

  it('refuses consent for an organization the person does not belong to', async () => {
    const user = await world.member('recruiter');
    const outsider = await createWorld(t, 'Not Mine');
    const outsiderOrg = ((await outsider.owner.get('/api/auth/organization/list')).body as unknown as { id: string }[])[0]!.id;
    const refused = await user.post('/api/auth/organization/set-active', { organizationId: outsiderOrg });
    expect(refused.status).not.toBe(200);
    const authorized = await authorize(t.app, user, await registeredClientId(t.app), newPkce());
    const preview = await user.post<{ organizations: { id: string }[] }>('/api/v1/connected-apps/consent-preview', { oauthQuery: consentQueryOf(authorized.headers.location) });
    expect(preview.body.data!.organizations.map((o) => o.id)).not.toContain(outsiderOrg);
  });
});

describe('API keys and REST', () => {
  it('still accept an API key on /mcp, and refuse an OAuth token on the REST api', async () => {
    const key = await createKey(world.owner, ['job:read']);
    expect((await mcp(key.secret)).statusCode).toBe(200);
    const tokens = await connect(t.app, world.owner);
    expect((await withKey(t.app, tokens.access_token, 'GET', '/api/v1/jobs')).status).toBe(401);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/connected-apps')).status).toBe(403);
  });
});

async function memberIdOf(w: World, email: string): Promise<string> {
  const full = (await w.owner.get('/api/auth/organization/get-full-organization')).body as unknown as { members: { id: string; user: { email: string } }[] };
  return full.members.find((m) => m.user.email === email)!.id;
}
