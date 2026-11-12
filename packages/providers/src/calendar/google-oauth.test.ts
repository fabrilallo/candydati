import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleCalendarAuth, GOOGLE_AUTHORIZATION_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GoogleOAuthError } from './google-oauth.js';

const NOW = new Date('2026-11-12T10:00:00Z');
const CLIENT = { clientId: 'client-123.apps.googleusercontent.com', clientSecret: 'not-a-real-secret' };
const REDIRECT = 'https://ats.example.com/api/v1/me/calendar/google/callback';
const VERIFIER = 'v'.repeat(43);
const EXCHANGE = { code: 'auth-code', codeVerifier: VERIFIER, redirectUri: REDIRECT };
const SCOPES = 'openid https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/userinfo.email';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims: Record<string, unknown> = {}) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENT.clientId, sub: '1', exp: NOW.getTime() / 1000 + 600, email: 'Anna@Example.com', email_verified: true, ...claims })}.signature`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TOKEN = { access_token: 'access-xyz', expires_in: 3599, refresh_token: 'refresh-abc', scope: SCOPES, token_type: 'Bearer' };

const google = (answer: (url: string, body: URLSearchParams) => Response = () => json({ ...TOKEN, id_token: idToken() })) => {
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => answer(String(url), init?.body as URLSearchParams));
  return { auth: createGoogleCalendarAuth({ ...CLIENT, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW }), fetchImpl };
};

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(GoogleOAuthError);
  return (error as GoogleOAuthError).reason;
};

describe('authorizationUrl', () => {
  it('asks for offline access to busy times and own events, with PKCE S256', () => {
    const url = new URL(google().auth.authorizationUrl({ state: 'state-1', codeVerifier: VERIFIER, redirectUri: REDIRECT }));
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT.clientId,
      redirect_uri: REDIRECT,
      scope: 'openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned',
      state: 'state-1',
      code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    expect(url.toString()).not.toContain(VERIFIER);
  });
});

describe('exchange', () => {
  it('sends the code with the verifier and the secret, and keeps the refresh token, the address and the scopes', async () => {
    const { auth, fetchImpl } = google();
    expect(await auth.exchange(EXCHANGE)).toEqual({ refreshToken: 'refresh-abc', accountEmail: 'anna@example.com', scopes: SCOPES });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-code',
      code_verifier: VERIFIER,
      redirect_uri: REDIRECT,
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
    });
    expect(init?.redirect).toBe('error');
  });

  it('rejects what it cannot trust, with a reason and never a token', async () => {
    const cases: [() => Response, string][] = [
      [() => json({ error: 'invalid_grant' }, 400), 'token_refused'],
      [() => new Response('not json'), 'token_invalid'],
      [() => new Response('x'.repeat(40_000)), 'token_invalid'],
      [() => json({ ...TOKEN, refresh_token: undefined, id_token: idToken() }), 'no_refresh_token'],
      [() => json({ ...TOKEN, id_token: 'not-a-jwt' }), 'id_token_invalid'],
      [() => json({ ...TOKEN, id_token: idToken({ aud: 'another-app' }) }), 'id_token_invalid'],
      [() => json({ ...TOKEN, id_token: idToken({ iss: 'https://evil.example' }) }), 'id_token_invalid'],
      [() => json({ ...TOKEN, id_token: idToken({ exp: NOW.getTime() / 1000 - 3600 }) }), 'id_token_invalid'],
      [() => json({ ...TOKEN, id_token: idToken({ email_verified: false }) }), 'id_token_invalid'],
    ];
    for (const [answer, reason] of cases) {
      const error = await google(answer).auth.exchange(EXCHANGE).then(() => null, (caught: unknown) => caught);
      expect((error as GoogleOAuthError).reason).toBe(reason);
      expect(String((error as Error).message)).not.toMatch(/refresh-abc|access-xyz|auth-code/);
    }
  });

  it('says Google is unreachable when the network fails', async () => {
    const { auth } = google(() => {
      throw new Error('ECONNRESET');
    });
    expect(await reasonOf(auth.exchange(EXCHANGE))).toBe('unreachable');
  });
});

describe('revoke', () => {
  it('posts the token to the revocation endpoint', async () => {
    const { auth, fetchImpl } = google(() => new Response('', { status: 200 }));
    await auth.revoke('refresh-abc');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(GOOGLE_REVOKE_URL);
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ token: 'refresh-abc' });
  });

  it('accepts a token Google already forgot, and rejects an outage', async () => {
    await expect(google(() => json({ error: 'invalid_token' }, 400)).auth.revoke('gone')).resolves.toBeUndefined();
    expect(await reasonOf(google(() => new Response('', { status: 503 })).auth.revoke('x'))).toBe('revoke_refused');
  });
});
