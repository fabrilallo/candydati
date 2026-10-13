import { afterAll, describe, expect, it } from 'vitest';
import { createInMemorySignInLockout, SIGN_IN_LOCK_MS, SIGN_IN_MAX_FAILURES } from './auth/sign-in-lockout.js';
import { createWorld, personForm } from './testing/candidate-world.js';
import { TestUser } from './testing/client.js';
import { createTestApp, PASSWORD, uniqueEmail, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

const apps: TestApp[] = [];
const app = async (...args: Parameters<typeof createTestApp>) => {
  const created = await createTestApp(...args);
  apps.push(created);
  return created;
};
afterAll(async () => {
  await Promise.all(apps.map((created) => created.close()));
});

const LIMITED = { max: 100_000, authMax: 5 };
const OUTSIDER = '203.0.113.9';

const getSession = (t: TestApp, headers: Record<string, string>, remoteAddress = OUTSIDER) =>
  t.app.inject({ method: 'GET', url: '/api/auth/get-session', remoteAddress, headers });

describe('client address (H1: rate limit bypass through a spoofed IP)', () => {
  it('shares one limit between requests from the same socket, whatever X-Forwarded-For they claim', async () => {
    const t = await app({ rateLimit: LIMITED });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await getSession(t, { 'x-forwarded-for': `198.51.100.${i + 1}` })).statusCode);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
  });

  it('does not let a client chain extra hops either', async () => {
    const t = await app({ rateLimit: LIMITED });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await getSession(t, { 'x-forwarded-for': `10.9.8.${i}, 192.0.2.${i}` })).statusCode);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('believes the forwarded address only from the trusted proxy (loopback by default), which tells clients apart', async () => {
    const t = await app({ rateLimit: LIMITED });
    for (let i = 0; i < 5; i += 1) expect((await getSession(t, { 'x-forwarded-for': '198.51.100.1' }, '127.0.0.1')).statusCode).toBe(200);
    expect((await getSession(t, { 'x-forwarded-for': '198.51.100.1' }, '127.0.0.1')).statusCode).toBe(429);
    expect((await getSession(t, { 'x-forwarded-for': '198.51.100.2' }, '127.0.0.1')).statusCode).toBe(200);
  });

  it('trusts a configured proxy address or CIDR instead', async () => {
    const t = await app({ rateLimit: LIMITED, env: { TRUST_PROXY: '10.0.0.0/8' } });
    for (let i = 0; i < 5; i += 1) await getSession(t, { 'x-forwarded-for': '198.51.100.1' }, '10.1.2.3');
    expect((await getSession(t, { 'x-forwarded-for': '198.51.100.1' }, '10.1.2.3')).statusCode).toBe(429);
    expect((await getSession(t, { 'x-forwarded-for': '198.51.100.2' }, '10.1.2.3')).statusCode).toBe(200);
    // Loopback is not in this list any more: its header is ignored.
    for (let i = 0; i < 5; i += 1) await getSession(t, { 'x-forwarded-for': `198.51.100.${i + 10}` }, '127.0.0.1');
    expect((await getSession(t, { 'x-forwarded-for': '198.51.100.99' }, '127.0.0.1')).statusCode).toBe(429);
  });
});

describe('sign-in lockout per account', () => {
  const signIn = (t: TestApp, email: string, password: string, ip: string) =>
    t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      remoteAddress: ip,
      headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' },
      payload: { email, password },
    });

  it('refuses an account for 15 minutes after 10 failures, from any address, even with the right password', async () => {
    let at = Date.now();
    const t = await app({ signInLockout: createInMemorySignInLockout(() => at) });
    const email = uniqueEmail('lock');
    await new TestUser(t.app, email, 'Lock').signUp();
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
      expect((await signIn(t, email, 'wrong-password-123', `203.0.113.${i + 1}`)).statusCode).toBe(401);
    }
    const locked = await signIn(t, email, PASSWORD, '198.51.100.77');
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toMatchObject({ success: false, error: { code: 'rate_limited' } });
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await signIn(t, email.toUpperCase(), PASSWORD, '198.51.100.78')).statusCode).toBe(429);
    expect((await signIn(t, uniqueEmail('other'), 'wrong-password-123', '198.51.100.77')).statusCode).toBe(401);
    at += SIGN_IN_LOCK_MS + 1;
    expect((await signIn(t, email, PASSWORD, '198.51.100.77')).statusCode).toBe(200);
  });

  it('a successful sign-in forgets earlier failures', async () => {
    const t = await app({ signInLockout: createInMemorySignInLockout() });
    const email = uniqueEmail('ok');
    await new TestUser(t.app, email, 'Ok').signUp();
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) await signIn(t, email, 'wrong-password-123', OUTSIDER);
      expect((await signIn(t, email, PASSWORD, OUTSIDER)).statusCode).toBe(200);
    }
  });
});

describe('daily caps on public applications', () => {
  it('answers 429 with a friendly message once the job reached its cap, and stores nothing more', async () => {
    const t = await app({ env: { APPLICATIONS_DAILY_MAX_PER_JOB: '2' } });
    const w = await createWorld(t);
    expect((await w.submit(personForm())).statusCode).toBe(201);
    expect((await w.submit(personForm())).statusCode).toBe(201);
    const refused = await w.submit(personForm());
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ success: false, error: { code: 'rate_limited', message: expect.stringContaining('try again tomorrow') } });
    const cards = (await w.owner.get<{ applications: unknown[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;
    expect(cards).toHaveLength(2);
  });

  it('caps the whole organization across its jobs', async () => {
    const t = await app({ env: { APPLICATIONS_DAILY_MAX_PER_ORGANIZATION: '1' } });
    const w = await createWorld(t);
    expect((await w.submit(personForm())).statusCode).toBe(201);
    expect((await w.submit(personForm())).statusCode).toBe(429);
    const other = await createWorld(t, 'Other');
    expect((await other.submit(personForm())).statusCode).toBe(201);
  });
});

describe('names that carry a link (M1)', () => {
  it('refuses a URL, an address or markup in the first name of the public form', async () => {
    const t = await app();
    const w = await createWorld(t);
    for (const firstName of ['https://evil.example/login', 'www.evil.example', 'x@evil.example', '<b>x</b>']) {
      expect((await w.submit(personForm({ firstName }))).statusCode).toBe(422);
    }
    expect((await w.submit(personForm({ firstName: "Anne-Marie d'Arc" }))).statusCode).toBe(201);
  });
});

describe('Cache-Control on authenticated responses (L2)', () => {
  it('sets private, no-store when the route chose nothing, and leaves public caching and explicit headers alone', async () => {
    const t = await app();
    const w = await createWorld(t);
    const list = await w.owner.download('/api/v1/candidates');
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect((await w.owner.download('/api/auth/get-session')).headers['cache-control']).toMatch(/no-store/);
    const publicJobs = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${w.slug}/jobs` });
    expect(publicJobs.headers['cache-control']).not.toBe('private, no-store');
    expect(publicJobs.headers['cache-control']).toMatch(/s-maxage/);
  });
});
