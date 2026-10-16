import { completeJobContent } from '@candydati/core/testing';
import { and, eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { TestUser } from './testing/client.js';
import { publishNotice } from './testing/privacy.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
let owner: TestUser;
let orgId: string;

beforeAll(async () => {
  t = await createTestApp();
  owner = await new TestUser(t.app, uniqueEmail('owner'), 'Owner').signUp();
  orgId = await owner.createOrganization('Keys Org');
  await publishNotice(owner);
});
afterAll(async () => {
  await t.close();
});

const newJob = async (user: TestUser = owner): Promise<string> => {
  const reply = await user.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Key job' }) });
  return reply.body.data!.id;
};

describe('creating keys', () => {
  it('returns the secret once and never the hash, and lists the key without it', async () => {
    const reply = await owner.post<{ key: Record<string, unknown>; secret: string }>('/api/v1/api-keys', { name: 'CI', scopes: ['job:read'] });
    expect(reply.status).toBe(201);
    expect(reply.body.data!.secret).toMatch(/^candydati_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/);
    expect(reply.body.data!.key).toMatchObject({ name: 'CI', scopes: ['job:read'], revokedAt: null });
    expect(JSON.stringify(reply.body)).not.toContain('hash');
    const list = await owner.get<{ id: string }[]>('/api/v1/api-keys');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(reply.body.data!.secret);
  });

  it.each(['candidate:decide', 'candidate:erase', 'message:send', 'data:export', 'api_key:manage', 'webhook:manage'])(
    'refuses the forbidden scope %s at creation',
    async (scope) => {
      const reply = await owner.post('/api/v1/api-keys', { name: 'Bad', scopes: ['job:read', scope] });
      expect(reply.status).toBe(422);
    },
  );

  it('refuses scopes the creator does not have', async () => {
    const recruiter = await new TestUser(t.app, uniqueEmail('rec'), 'Rec').signUp();
    await recruiter.joinAs(owner, 'recruiter');
    const reply = await recruiter.post('/api/v1/api-keys', { name: 'Mine', scopes: ['job:read'] });
    expect(reply.status).toBe(403);
  });
});

describe('bearer authentication', () => {
  it('authenticates a good key without a cookie and without an origin', async () => {
    const key = await createKey(owner, ['job:read']);
    const reply = await withKey(t.app, key.secret, 'GET', '/api/v1/jobs');
    expect(reply.status).toBe(200);
  });

  it.each([
    ['no secret after Bearer', 'Bearer '],
    ['a malformed key', 'Bearer candydati_nope'],
    ['an unknown well-formed key', `Bearer candydati_${'a'.repeat(8)}_${'b'.repeat(32)}`],
  ])('answers 401 in the envelope for %s', async (_label, header) => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/jobs', headers: { authorization: header } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ success: false, data: null, error: { code: 'unauthenticated' } });
  });

  it('ignores cookies when a bearer is present: a bad key with a good session is still 401', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/v1/jobs',
      headers: { authorization: `Bearer candydati_${'a'.repeat(8)}_${'b'.repeat(32)}`, cookie: owner.cookieHeader() },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stops working once revoked, and a second revoke is a conflict', async () => {
    const key = await createKey(owner, ['job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(200);
    const revoked = await owner.post(`/api/v1/api-keys/${key.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(401);
    expect((await owner.post(`/api/v1/api-keys/${key.id}/revoke`)).status).toBe(409);
  });

  it('stops working once expired', async () => {
    const key = await createKey(owner, ['job:read'], { expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(200);
    await t.handle.db.update(schema.apiKey).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.apiKey.id, key.id));
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(401);
  });

  it('never has more than its creator has now: a demoted creator loses the scopes the new role lacks, a removed one kills the key', async () => {
    const admin = await new TestUser(t.app, uniqueEmail('adm'), 'Adm').signUp();
    await admin.joinAs(owner, 'admin');
    const key = await createKey(admin, ['audit:read', 'job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/audit-log')).status).toBe(200);
    const [member] = await t.handle.db.select().from(schema.member).where(and(eq(schema.member.organizationId, orgId), eq(schema.member.role, 'admin')));
    await t.handle.db.update(schema.member).set({ role: 'recruiter' }).where(eq(schema.member.id, member!.id));
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/audit-log')).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(200);
    await t.handle.db.delete(schema.member).where(eq(schema.member.id, member!.id));
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(401);
  });
});

describe('scopes', () => {
  it('lets a job:read key read but not create, and a job:create key create but not publish', async () => {
    const reader = await createKey(owner, ['job:read']);
    const created = await withKey(t.app, reader.secret, 'POST', '/api/v1/jobs', { body: { content: { title: 'Nope' } } });
    expect(created.status).toBe(403);
    const writer = await createKey(owner, ['job:read', 'job:create']);
    const draft = await withKey<{ id: string }>(t.app, writer.secret, 'POST', '/api/v1/jobs', { body: { content: completeJobContent({ title: 'Mine' }) } });
    expect(draft.status).toBe(201);
    const publish = await withKey(t.app, writer.secret, 'POST', `/api/v1/jobs/${draft.body.data!.id}/publish`);
    expect(publish.status).toBe(403);
  });

  it('audits what a key does as an api_key actor on behalf of its creator', async () => {
    const key = await createKey(owner, ['job:create']);
    const draft = await withKey<{ id: string }>(t.app, key.secret, 'POST', '/api/v1/jobs', { body: { content: { title: 'Audited' } } });
    expect(draft.status).toBe(201);
    const log = await owner.get<{ actor: { type: string; id: string; onBehalfOfUserId: string }; action: string; target: { id: string } }[]>('/api/v1/audit-log?action=job.created');
    const event = log.body.data!.find((item) => item.target.id === draft.body.data!.id);
    expect(event?.actor).toMatchObject({ type: 'api_key', id: key.id });
    expect(event?.actor.onBehalfOfUserId).toBeTruthy();
  });

  it('refuses a key on routes it can never use, even with a scope list that was tampered with in the database', async () => {
    const key = await createKey(owner, ['job:read']);
    await t.handle.db.update(schema.apiKey).set({ scopes: ['job:read', 'candidate:decide', 'message:send', 'api_key:manage'] }).where(eq(schema.apiKey.id, key.id));
    expect((await withKey(t.app, key.secret, 'POST', '/api/v1/applications/decide', { body: { applicationIds: ['x'], outcome: 'not_selected' } })).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/api-keys')).status).toBe(403);
  });

  it('is session only for key management and notifications: a key cannot mint, list or revoke keys', async () => {
    const key = await createKey(owner, ['job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/api-keys')).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'POST', '/api/v1/api-keys', { body: { name: 'x', scopes: ['job:read'] } })).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'POST', `/api/v1/api-keys/${key.id}/revoke`)).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/notifications')).status).toBe(403);
  });
});

describe('organizations', () => {
  it('answers 404 for ids of another organization on every kind of lookup', async () => {
    const other = await new TestUser(t.app, uniqueEmail('other'), 'Other').signUp();
    await other.createOrganization('Other Org');
    const foreignJob = await newJob(other);
    const key = await createKey(owner, ['job:read', 'job:update', 'candidate:read', 'task:read']);
    for (const url of [`/api/v1/jobs/${foreignJob}`, `/api/v1/jobs/${foreignJob}/pipeline`, '/api/v1/candidates/nope', '/api/v1/applications/nope/tasks']) {
      expect((await withKey(t.app, key.secret, 'GET', url)).status).toBe(404);
    }
    const update = await withKey(t.app, key.secret, 'PUT', `/api/v1/jobs/${foreignJob}`, { body: { content: completeJobContent() } });
    expect(update.status).toBe(404);
  });
});

describe('CSRF', () => {
  it('skips bearer requests (no cookie to forge) but still refuses cookies from an untrusted origin', async () => {
    const key = await createKey(owner, ['job:create']);
    const bearer = await withKey(t.app, key.secret, 'POST', '/api/v1/jobs', {
      body: { content: { title: 'From a script' } },
      headers: { origin: 'https://evil.example.com' },
    });
    expect(bearer.status).toBe(201);
    const cookie = await t.app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { origin: 'https://evil.example.com', cookie: owner.cookieHeader() },
      payload: { content: { title: 'Forged' } },
    });
    expect(cookie.statusCode).toBe(403);
  });
});

describe('per-key rate limit', () => {
  it('answers 429 in the envelope past the key budget, without touching other keys', async () => {
    const limited = await createTestApp({ rateLimit: { max: 100_000, authMax: 100_000, apiKeyMax: 3 } });
    try {
      const user = await new TestUser(limited.app, uniqueEmail('rl'), 'Rl').signUp();
      await user.createOrganization('Limited Org');
      const first = await createKey(user, ['job:read']);
      const second = await createKey(user, ['job:read']);
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) statuses.push((await withKey(limited.app, first.secret, 'GET', '/api/v1/jobs')).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
      expect((await withKey(limited.app, second.secret, 'GET', '/api/v1/jobs')).status).toBe(200);
    } finally {
      await limited.close();
    }
  });
});
