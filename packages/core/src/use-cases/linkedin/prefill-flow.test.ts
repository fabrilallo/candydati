import type { LinkedInClaims } from '@candydati/domain';
import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../errors.js';
import type { LinkedInIdentity } from '../../linkedin-prefill-ports.js';
import { beginLinkedInPrefill, completeLinkedInPrefill, type PendingLinkedInLogin } from './prefill-flow.js';

const REDIRECT = 'https://jobs.example/api/v1/public/linkedin/callback';
const RETURN = '/careers/acme/backend-1';
const CLAIMS: LinkedInClaims = { givenName: 'Giulia', familyName: 'Rossi', email: 'giulia@example.com', emailVerified: true };

const fakeIdentity = (claims: () => Promise<LinkedInClaims> = async () => CLAIMS) => {
  const claimsFor = vi.fn(claims);
  const identity: LinkedInIdentity = {
    authorizationUrl: ({ state, nonce, redirectUri }) => `https://linkedin.example/auth?state=${state}&nonce=${nonce}&redirect_uri=${redirectUri}`,
    claimsFor,
  };
  return { identity, claimsFor };
};

const tokens = () => {
  let next = 0;
  return () => `token${(next += 1)}`;
};

const begin = (identity = fakeIdentity().identity) => beginLinkedInPrefill({ identity, randomToken: tokens() }, { returnPath: RETURN, redirectUri: REDIRECT });

describe('beginLinkedInPrefill', () => {
  it('creates a state bound to the job page and a nonce, and points at LinkedIn', () => {
    const started = begin();
    expect(started.pending).toEqual({ state: `token1.${Buffer.from(RETURN).toString('base64url')}`, nonce: 'token2', returnPath: RETURN });
    expect(started.location).toBe(`https://linkedin.example/auth?state=${started.pending.state}&nonce=token2&redirect_uri=${REDIRECT}`);
  });

  it('refuses a return that is not a job page of this site', () => {
    const run = () => beginLinkedInPrefill({ identity: fakeIdentity().identity, randomToken: tokens() }, { returnPath: 'https://evil.example/', redirectUri: REDIRECT });
    expect(run).toThrow(ValidationError);
  });
});

describe('completeLinkedInPrefill', () => {
  const pending = (): PendingLinkedInLogin => begin().pending;

  it('exchanges the code and returns only the form fields', async () => {
    const { identity, claimsFor } = fakeIdentity();
    const login = pending();
    const done = await completeLinkedInPrefill({ identity }, { query: { code: 'c0de', state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(done).toEqual({ returnPath: RETURN, result: { status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: 'giulia@example.com' } } });
    expect(claimsFor).toHaveBeenCalledWith({ code: 'c0de', redirectUri: REDIRECT, nonce: login.nonce });
  });

  it('fails without exchanging when the state does not match, or no login is pending', async () => {
    const { identity, claimsFor } = fakeIdentity();
    const login = pending();
    const forged = await completeLinkedInPrefill({ identity }, { query: { code: 'c', state: `x${login.state}` }, pending: login, redirectUri: REDIRECT });
    expect(forged).toMatchObject({ returnPath: RETURN, result: { status: 'failed' }, problem: { reason: 'state_mismatch' } });
    const lost = await completeLinkedInPrefill({ identity }, { query: { code: 'c', state: login.state }, pending: null, redirectUri: REDIRECT });
    expect(lost).toMatchObject({ returnPath: RETURN, result: { status: 'failed' }, problem: { reason: 'state_mismatch' } });
    expect(claimsFor).not.toHaveBeenCalled();
  });

  it('cannot be sent anywhere by a forged state when nothing is pending', async () => {
    const evil = `abc.${Buffer.from('//evil.example').toString('base64url')}`;
    const done = await completeLinkedInPrefill({ identity: fakeIdentity().identity }, { query: { code: 'c', state: evil }, pending: null, redirectUri: REDIRECT });
    expect(done.returnPath).toBeNull();
    const garbage = await completeLinkedInPrefill({ identity: fakeIdentity().identity }, { query: { state: 'no-dot' }, pending: null, redirectUri: REDIRECT });
    expect(garbage.returnPath).toBeNull();
  });

  it('tells a cancelled login apart from other LinkedIn errors', async () => {
    const login = pending();
    const { identity } = fakeIdentity();
    for (const error of ['user_cancelled_login', 'user_cancelled_authorize']) {
      const done = await completeLinkedInPrefill({ identity }, { query: { error, error_description: 'x', state: login.state }, pending: login, redirectUri: REDIRECT });
      expect(done.result).toEqual({ status: 'cancelled' });
    }
    const denied = await completeLinkedInPrefill({ identity }, { query: { error: 'unauthorized_scope_error', state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(denied).toMatchObject({ result: { status: 'failed' }, problem: { reason: 'linkedin_error', detail: 'unauthorized_scope_error' } });
  });

  it('fails on a missing code, a malformed query and a failed exchange', async () => {
    const login = pending();
    const noCode = await completeLinkedInPrefill({ identity: fakeIdentity().identity }, { query: { state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(noCode).toMatchObject({ result: { status: 'failed' }, problem: { reason: 'invalid_query' } });
    const malformed = await completeLinkedInPrefill({ identity: fakeIdentity().identity }, { query: { code: ['a', 'b'], state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(malformed).toMatchObject({ returnPath: RETURN, result: { status: 'failed' }, problem: { reason: 'invalid_query' } });
    const outage = new Error('linkedin down');
    const failing = fakeIdentity(async () => Promise.reject(outage)).identity;
    const exchange = await completeLinkedInPrefill({ identity: failing }, { query: { code: 'c', state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(exchange).toMatchObject({ result: { status: 'failed' }, problem: { reason: 'exchange_failed', error: outage } });
  });

  it('keeps an unverified email out of the form', async () => {
    const login = pending();
    const identity = fakeIdentity(async () => ({ ...CLAIMS, emailVerified: false })).identity;
    const done = await completeLinkedInPrefill({ identity }, { query: { code: 'c', state: login.state }, pending: login, redirectUri: REDIRECT });
    expect(done.result).toEqual({ status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: null } });
  });
});
