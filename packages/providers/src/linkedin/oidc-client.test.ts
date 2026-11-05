import { describe, expect, it, vi } from 'vitest';
import {
  createLinkedInIdentity,
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  LinkedInExchangeError,
} from './oidc-client.js';

const NOW = new Date('2026-11-05T10:00:00Z');
const CLIENT = { clientId: 'client-123', clientSecret: 'not-a-real-secret' };
const REDIRECT = 'https://jobs.example/api/v1/public/linkedin/callback';
const EXCHANGE = { code: 'auth-code', redirectUri: REDIRECT, nonce: 'nonce-1' };

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims: Record<string, unknown> = {}) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://www.linkedin.com', aud: 'client-123', sub: 'member-1', exp: NOW.getTime() / 1000 + 600, nonce: 'nonce-1', ...claims })}.signature`;
const USERINFO = {
  sub: 'member-1',
  name: 'Giulia Rossi',
  given_name: 'Giulia',
  family_name: 'Rossi',
  picture: 'https://media.licdn.example/photo.jpg',
  locale: 'it-IT',
  email: 'giulia@example.com',
  email_verified: true,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const linkedIn = (overrides: { token?: () => Response; userinfo?: () => Response } = {}) => {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === LINKEDIN_TOKEN_URL) return overrides.token?.() ?? json({ access_token: 'access-xyz', expires_in: 3600, id_token: idToken() });
    if (String(url) === LINKEDIN_USERINFO_URL) return overrides.userinfo?.() ?? json(USERINFO);
    throw new Error(`unexpected ${String(url)}`);
  });
  return { identity: createLinkedInIdentity({ ...CLIENT, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW }), fetchImpl };
};

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(LinkedInExchangeError);
  return (error as LinkedInExchangeError).reason;
};

describe('authorizationUrl', () => {
  it('asks for the OpenID scopes only, with state, nonce and the registered redirect URL', () => {
    const url = new URL(linkedIn().identity.authorizationUrl({ state: 's.1', nonce: 'n1', redirectUri: REDIRECT }));
    expect(`${url.origin}${url.pathname}`).toBe(LINKEDIN_AUTHORIZATION_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-123',
      redirect_uri: REDIRECT,
      state: 's.1',
      nonce: 'n1',
      scope: 'openid profile email',
    });
  });
});

describe('claimsFor', () => {
  it('exchanges the code server side and returns names and email, never photo, locale or member id', async () => {
    const { identity, fetchImpl } = linkedIn();
    const claims = await identity.claimsFor(EXCHANGE);
    expect(claims).toEqual({ givenName: 'Giulia', familyName: 'Rossi', email: 'giulia@example.com', emailVerified: true });
    const [, tokenInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenInit.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(tokenInit.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: REDIRECT,
      client_id: 'client-123',
      client_secret: 'not-a-real-secret',
    });
    const [, userInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(userInit.headers).get('authorization')).toBe('Bearer access-xyz');
  });

  it('reads an email that is not verified, or a missing one, as unverified', async () => {
    const unverified = linkedIn({ userinfo: () => json({ ...USERINFO, email_verified: 'yes' }) }).identity;
    expect(await unverified.claimsFor(EXCHANGE)).toMatchObject({ emailVerified: false });
    const none = linkedIn({ userinfo: () => json({ sub: 'member-1', given_name: 'G' }) }).identity;
    expect(await none.claimsFor(EXCHANGE)).toEqual({ givenName: 'G', familyName: null, email: null, emailVerified: false });
  });

  it('fails when LinkedIn refuses the code or answers something it does not understand', async () => {
    expect(await reasonOf(linkedIn({ token: () => json({ error: 'invalid_request' }, 400) }).identity.claimsFor(EXCHANGE))).toBe('token_refused');
    expect(await reasonOf(linkedIn({ token: () => json({ token: 'x' }) }).identity.claimsFor(EXCHANGE))).toBe('token_invalid');
    expect(await reasonOf(linkedIn({ token: () => new Response('<html>', { status: 200 }) }).identity.claimsFor(EXCHANGE))).toBe('token_invalid');
  });

  it('refuses an ID token for another app, from another issuer, expired, with another nonce or unreadable', async () => {
    const withToken = (token: string) => linkedIn({ token: () => json({ access_token: 'a', id_token: token }) }).identity.claimsFor(EXCHANGE);
    expect(await reasonOf(withToken(idToken({ aud: 'other-app' })))).toBe('id_token_invalid');
    expect(await reasonOf(withToken(idToken({ iss: 'https://evil.example' })))).toBe('id_token_invalid');
    expect(await reasonOf(withToken(idToken({ exp: NOW.getTime() / 1000 - 600 })))).toBe('id_token_invalid');
    expect(await reasonOf(withToken(idToken({ nonce: 'replayed' })))).toBe('id_token_invalid');
    expect(await reasonOf(withToken('not-a-jwt'))).toBe('id_token_invalid');
    expect(await reasonOf(withToken(`a.${Buffer.from('{').toString('base64url')}.c`))).toBe('id_token_invalid');
    expect(await linkedIn({ token: () => json({ access_token: 'a', id_token: idToken({ aud: ['x', 'client-123'], nonce: undefined }) }) }).identity.claimsFor(EXCHANGE)).toMatchObject({ givenName: 'Giulia' });
  });

  it('refuses a userinfo of another member, a refused or a malformed one', async () => {
    expect(await reasonOf(linkedIn({ userinfo: () => json({ ...USERINFO, sub: 'someone-else' }) }).identity.claimsFor(EXCHANGE))).toBe('userinfo_invalid');
    expect(await reasonOf(linkedIn({ userinfo: () => json({ message: 'nope' }, 401) }).identity.claimsFor(EXCHANGE))).toBe('userinfo_refused');
    expect(await reasonOf(linkedIn({ userinfo: () => json([1, 2]) }).identity.claimsFor(EXCHANGE))).toBe('userinfo_invalid');
    expect(await reasonOf(linkedIn({ userinfo: () => json({ ...USERINFO, given_name: 42 }) }).identity.claimsFor(EXCHANGE))).toBe('userinfo_invalid');
  });

  it('turns an outage into an error that carries no token and no answer', async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new Error('connect ECONNREFUSED')));
    const identity = createLinkedInIdentity({ ...CLIENT, fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await identity.claimsFor(EXCHANGE).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinkedInExchangeError);
    expect((error as LinkedInExchangeError).reason).toBe('unreachable');
    expect(String((error as Error).message)).not.toContain('auth-code');
  });

  it('refuses an answer too large to be a token or a profile', async () => {
    const huge = () => new Response(JSON.stringify({ access_token: 'a'.repeat(100_000) }), { status: 200 });
    expect(await reasonOf(linkedIn({ token: huge }).identity.claimsFor(EXCHANGE))).toBe('token_invalid');
  });
});
