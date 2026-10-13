import { createInMemoryFileStorage, createInMemoryTaskQueue } from '@tt/core/testing';
import { createDb } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { TestUser } from './testing/client.js';
import { createTestApp, testEnv, uniqueEmail, WEB_ORIGIN, type TestApp } from './testing/test-app.js';
import { apiTestDatabaseUrl } from './testing/test-database.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('GET /api/health', () => {
  it('answers without authentication and checks the database', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' }, error: null });
  });

  it('answers 503 in the envelope when the database is unreachable', async () => {
    const handle = createDb(apiTestDatabaseUrl(), 1);
    const app = await buildServer({ env: testEnv(), db: handle.db, files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue() });
    await handle.close();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, data: null, error: { code: 'unavailable' } });
    await app.close();
  });
});

describe('security plugins', () => {
  it('sets helmet headers', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([WEB_ORIGIN, 'http://localhost:3100'])('allows credentialed requests from trusted origin %s', async (origin) => {
    const response = await t.app.inject({ method: 'OPTIONS', url: '/api/v1/audit-log', headers: { origin, 'access-control-request-method': 'GET' } });
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow other origins', async () => {
    const response = await t.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/audit-log',
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'GET' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses a state-changing request carrying a session from an untrusted origin (CSRF)', async () => {
    const user = await new TestUser(t.app, uniqueEmail('csrf'), 'Csrf').signUp();
    const cookie = user.cookieHeader();
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/organization/create',
      headers: { origin: 'https://evil.example.com', cookie },
      payload: { name: 'Evil', slug: `evil-${Date.now()}` },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('rate limiting', () => {
  it('limits auth routes more strictly than the rest, answering 429 in the envelope', async () => {
    const limited = await createTestApp({ rateLimit: { max: 100, authMax: 2 } });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        statuses.push((await limited.app.inject({ method: 'GET', url: '/api/auth/ok' })).statusCode);
      }
      expect(statuses).toEqual([200, 200, 429]);
      const blocked = await limited.app.inject({ method: 'GET', url: '/api/auth/ok' });
      expect(blocked.json()).toEqual({ success: false, data: null, error: { code: 'rate_limited', message: 'Too many requests.' } });
      expect((await limited.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it('keeps session reads (every SSR page makes a few) out of the strict auth bucket', async () => {
    const limited = await createTestApp({ rateLimit: { max: 100, authMax: 2 } });
    try {
      const reads: number[] = [];
      for (let i = 0; i < 10; i += 1) reads.push((await limited.app.inject({ method: 'GET', url: '/api/auth/get-session' })).statusCode);
      expect(reads.every((status) => status !== 429)).toBe(true);
      // The strict bucket is untouched by the reads and still enforced.
      const strict: number[] = [];
      for (let i = 0; i < 3; i += 1) strict.push((await limited.app.inject({ method: 'GET', url: '/api/auth/ok' })).statusCode);
      expect(strict).toEqual([200, 200, 429]);
    } finally {
      await limited.close();
    }
  });

  it('limits every other route too', async () => {
    const limited = await createTestApp({ rateLimit: { max: 2, authMax: 100 } });
    try {
      const statuses = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await limited.app.inject({ method: 'GET', url: '/api/health' })).statusCode);
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('error handling', () => {
  it('answers malformed JSON with a 400 envelope', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, data: null, error: { code: 'bad_request' } });
  });

  it('works with the default log email sender', async () => {
    const handle = createDb(apiTestDatabaseUrl(), 1);
    const app = await buildServer({ env: testEnv(), db: handle.db, files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue() });
    const owner = await new TestUser(app, uniqueEmail('log'), 'Log Owner').signUp();
    await owner.createOrganization('LogOrg');
    const reply = await owner.post('/api/auth/organization/invite-member', { email: uniqueEmail('x'), role: 'recruiter' });
    expect(reply.status).toBe(200);
    await app.close();
    await handle.close();
  });
});
