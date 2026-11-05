import type { LinkedInClaims } from '@candydati/domain';
import type { LinkedInAccount } from '@candydati/core';
import { createSecretBox } from '@candydati/providers';
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerErrorHandler } from '../http/error-handler.js';
import { LINKEDIN_PREFILL_COOKIE, LINKEDIN_STATE_COOKIE, registerLinkedInRoutes, type LinkedInRouteDeps } from './public-linkedin.js';

const SECRET = 'test-secret-test-secret-test-secret-123';
const BASE = '/api/v1/public/linkedin';
const RETURN = '/careers/acme/backend-1';
const CLAIMS: LinkedInClaims = { givenName: 'Giulia', familyName: 'Rossi', email: 'giulia@example.com', emailVerified: true };

const fakeIdentity = (claimsFor: () => Promise<LinkedInClaims> = async () => CLAIMS) => {
  const spy = vi.fn(claimsFor);
  const identity: LinkedInAccount = {
    authorizationUrl: ({ state, nonce, redirectUri }) => `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ state, nonce, redirect_uri: redirectUri }).toString()}`,
    claimsFor: spy,
  };
  return { identity, spy };
};

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const build = async (overrides: Partial<LinkedInRouteDeps> = {}) => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  const { identity, spy } = fakeIdentity();
  registerLinkedInRoutes(app, { identity, box: createSecretBox(SECRET, { info: 'test' }), platformUrl: 'https://jobs.example', routeConfig: {}, onProblem: vi.fn(), ...overrides });
  await app.ready();
  apps.push(app);
  return { app, spy };
};

/** `name=value` pairs of the Set-Cookie headers, to send back as a browser would. */
const cookiesOf = (response: LightMyRequestResponse): Record<string, string> =>
  Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie.value]));
const setCookieHeaders = (response: LightMyRequestResponse): string[] => {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header : header === undefined ? [] : [String(header)];
};

const start = (app: FastifyInstance, returnPath = RETURN) => app.inject({ method: 'GET', url: `${BASE}/start?return=${encodeURIComponent(returnPath)}` });

const callback = (app: FastifyInstance, query: Record<string, string>, cookie?: string) =>
  app.inject({ method: 'GET', url: `${BASE}/callback?${new URLSearchParams(query).toString()}`, headers: cookie ? { cookie } : {} });

const prefill = (app: FastifyInstance, cookie?: string) => app.inject({ method: 'POST', url: `${BASE}/prefill`, headers: cookie ? { cookie } : {} });

/** Runs start, then the callback with the state LinkedIn would echo. */
const login = async (app: FastifyInstance, query: (state: string) => Record<string, string>) => {
  const started = await start(app);
  const state = new URL(String(started.headers.location)).searchParams.get('state') ?? '';
  const stateCookie = cookiesOf(started)[LINKEDIN_STATE_COOKIE];
  return callback(app, query(state), `${LINKEDIN_STATE_COOKIE}=${stateCookie}`);
};

describe('GET /status', () => {
  it('says whether the button may show', async () => {
    const on = await build();
    expect((await on.app.inject({ url: `${BASE}/status` })).json()).toMatchObject({ success: true, data: { enabled: true } });
    const off = await build({ identity: null });
    expect((await off.app.inject({ url: `${BASE}/status` })).json()).toMatchObject({ success: true, data: { enabled: false } });
  });
});

describe('GET /start', () => {
  it('redirects to LinkedIn with the registered callback and keeps state in a sealed, scoped cookie', async () => {
    const { app } = await build();
    const response = await start(app);
    expect(response.statusCode).toBe(302);
    const location = new URL(String(response.headers.location));
    expect(location.origin).toBe('https://www.linkedin.com');
    expect(location.searchParams.get('redirect_uri')).toBe('https://jobs.example/api/v1/public/linkedin/callback');
    const [cookie] = setCookieHeaders(response);
    expect(cookie).toMatch(new RegExp(`^${LINKEDIN_STATE_COOKIE}=sb1\\.[A-Za-z0-9_-]+; Path=/api/v1/public/linkedin; Max-Age=600; HttpOnly; SameSite=Lax; Secure$`));
    expect(cookie).not.toContain(location.searchParams.get('nonce') ?? 'nonce');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a return that is not a job page of this site (no open redirect)', async () => {
    const { app } = await build();
    for (const target of ['https://evil.example/', '//evil.example', '/app/jobs']) {
      const response = await start(app, target);
      expect(response.statusCode).toBe(422);
      expect(response.headers.location).toBeUndefined();
      expect(setCookieHeaders(response)).toEqual([]);
    }
  });

  it('does not exist when LinkedIn is not configured', async () => {
    const { app } = await build({ identity: null });
    expect((await start(app)).statusCode).toBe(404);
    expect((await callback(app, { code: 'c', state: 's' })).statusCode).toBe(404);
  });

  it('omits Secure on a plain http development site', async () => {
    const { app } = await build({ platformUrl: 'http://localhost:3000' });
    expect(setCookieHeaders(await start(app))[0]).not.toContain('Secure');
  });
});

describe('GET /callback', () => {
  it('fills the form: prefill in a sealed cookie, state cleared, back to the job page with no personal data in the URL', async () => {
    const { app, spy } = await build();
    const response = await login(app, (state) => ({ code: 'auth-code', state }));
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${RETURN}#apply-linkedin`);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ code: 'auth-code', redirectUri: 'https://jobs.example/api/v1/public/linkedin/callback' }));
    const headers = setCookieHeaders(response);
    expect(headers).toContain(`${LINKEDIN_STATE_COOKIE}=; Path=/api/v1/public/linkedin; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
    const sealed = cookiesOf(response)[LINKEDIN_PREFILL_COOKIE] ?? '';
    expect(sealed).toMatch(/^sb1\./);
    expect(headers.join()).not.toMatch(/Giulia|Rossi|giulia@example\.com/);

    const first = await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`);
    expect(first.json()).toEqual({ success: true, error: null, data: { status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: 'giulia@example.com' } } });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(setCookieHeaders(first)).toContain(`${LINKEDIN_PREFILL_COOKIE}=; Path=/api/v1/public/linkedin; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
  });

  it('refuses a state that does not match the cookie, without calling LinkedIn', async () => {
    const onProblem = vi.fn();
    const { app, spy } = await build({ onProblem });
    const response = await login(app, (state) => ({ code: 'auth-code', state: `${state}x` }));
    expect(response.headers.location).toBe(`${RETURN}#apply-linkedin`);
    expect(spy).not.toHaveBeenCalled();
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ reason: 'state_mismatch' }));
    const sealed = cookiesOf(response)[LINKEDIN_PREFILL_COOKIE];
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data).toEqual({ status: 'failed' });
  });

  it('goes home when neither the cookie nor the state name a job page', async () => {
    const { app } = await build();
    const response = await callback(app, { code: 'c', state: 'forged' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
  });

  it('brings a candidate who cancelled back to the form with a gentle outcome', async () => {
    const { app, spy } = await build();
    const response = await login(app, (state) => ({ error: 'user_cancelled_authorize', error_description: 'The user cancelled', state }));
    expect(response.headers.location).toBe(`${RETURN}#apply-linkedin`);
    expect(spy).not.toHaveBeenCalled();
    const sealed = cookiesOf(response)[LINKEDIN_PREFILL_COOKIE];
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data).toEqual({ status: 'cancelled' });
  });

  it('reports a failed exchange without personal data and still returns to the form', async () => {
    const onProblem = vi.fn();
    const { identity } = fakeIdentity(async () => Promise.reject(new Error('linkedin: token_refused')));
    const { app } = await build({ identity, onProblem });
    const response = await login(app, (state) => ({ code: 'auth-code', state }));
    expect(response.headers.location).toBe(`${RETURN}#apply-linkedin`);
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ reason: 'exchange_failed' }));
    const sealed = cookiesOf(response)[LINKEDIN_PREFILL_COOKIE];
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data).toEqual({ status: 'failed' });
  });

  it('keeps an unverified email out of the form', async () => {
    const { identity } = fakeIdentity(async () => ({ ...CLAIMS, emailVerified: false }));
    const { app } = await build({ identity });
    const sealed = cookiesOf(await login(app, (state) => ({ code: 'c', state })))[LINKEDIN_PREFILL_COOKIE];
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data.prefill.email).toBeNull();
  });
});

describe('POST /prefill', () => {
  it('answers none without a cookie, or with one that was tampered with', async () => {
    const { app } = await build();
    expect((await prefill(app)).json().data).toEqual({ status: 'none' });
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=sb1.AAAA`)).json().data).toEqual({ status: 'none' });
  });

  it('answers once: the browser drops the cookie, and a replayed copy is refused after 10 minutes', async () => {
    let now = new Date('2026-11-05T10:00:00Z');
    const { app } = await build({ now: () => now });
    const sealed = cookiesOf(await login(app, (state) => ({ code: 'c', state })))[LINKEDIN_PREFILL_COOKIE];
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data.status).toBe('filled');
    expect((await prefill(app)).json().data).toEqual({ status: 'none' });
    now = new Date(now.getTime() + 10 * 60_000 + 1);
    expect((await prefill(app, `${LINKEDIN_PREFILL_COOKIE}=${sealed}`)).json().data).toEqual({ status: 'none' });
  });

  it('works when LinkedIn is off too (nothing pending)', async () => {
    const { app } = await build({ identity: null });
    expect((await prefill(app)).json().data).toEqual({ status: 'none' });
  });
});
