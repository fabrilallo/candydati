import { describe, expect, it } from 'vitest';
import { consentRefusal, grantedClientOf, registrationRefusal, type ConsentGateLookups } from './mcp-oauth-gates.js';

const lookups = (roles: Record<string, string>, requiring: readonly string[] = []): ConsentGateLookups => ({
  roleOf: async (userId, organizationId) => roles[`${organizationId}|${userId}`] ?? null,
  requiresTwoFactor: async (organizationId) => requiring.includes(organizationId),
});

const subject = { userId: 'u1', emailVerified: true, twoFactorEnabled: false, activeOrganizationId: 'o1' };

describe('consentRefusal', () => {
  it('lets a confirmed member connect an app to their active organization', async () => {
    expect(await consentRefusal(subject, lookups({ 'o1|u1': 'recruiter' }))).toBeNull();
  });

  it('refuses without a session, an unconfirmed address, an active organization or a membership', async () => {
    const member = lookups({ 'o1|u1': 'recruiter' });
    expect(await consentRefusal(null, member)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await consentRefusal({ ...subject, emailVerified: false }, member)).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(await consentRefusal({ ...subject, activeOrganizationId: null }, member)).toMatchObject({ code: 'NO_ACTIVE_ORGANIZATION' });
    expect(await consentRefusal(subject, lookups({ 'o2|u1': 'owner' }))).toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(await consentRefusal(subject, lookups({ 'o1|u1': 'pilot' }))).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('refuses an owner or admin without 2FA where the organization requires it', async () => {
    expect(await consentRefusal(subject, lookups({ 'o1|u1': 'admin' }, ['o1']))).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
    expect(await consentRefusal({ ...subject, twoFactorEnabled: true }, lookups({ 'o1|u1': 'admin' }, ['o1']))).toBeNull();
    expect(await consentRefusal(subject, lookups({ 'o1|u1': 'recruiter' }, ['o1']))).toBeNull();
  });
});

describe('registrationRefusal', () => {
  const allows = (uri: string) => uri === 'https://claude.ai/api/mcp/auth_callback';

  it('accepts a registration whose every callback is allowed', () => {
    expect(registrationRefusal({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }, allows)).toBeNull();
  });

  it('refuses any callback outside the list, a missing list and odd shapes', () => {
    expect(registrationRefusal({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'] }, allows)).toMatch(/evil\.example/);
    expect(registrationRefusal({ redirect_uris: [] }, allows)).not.toBeNull();
    expect(registrationRefusal({}, allows)).not.toBeNull();
    expect(registrationRefusal({ redirect_uris: [42] }, allows)).not.toBeNull();
    expect(registrationRefusal(null, allows)).not.toBeNull();
  });

  it('never grants client credentials: an app always acts for a person', () => {
    expect(registrationRefusal({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['client_credentials'] }, allows)).toMatch(/client_credentials/);
  });
});

describe('grantedClientOf', () => {
  const query = 'client_id=c1&redirect_uri=x&sig=s';

  it('names the client of an accepted consent that issued a code', () => {
    expect(grantedClientOf({ accept: true, oauth_query: query }, { redirect: true, url: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s' })).toBe('c1');
  });

  it('is null for a refusal, an error or a redirect without code', () => {
    expect(grantedClientOf({ accept: false, oauth_query: query }, { redirect: true, url: 'https://claude.ai/cb?code=abc' })).toBeNull();
    expect(grantedClientOf({ accept: true, oauth_query: query }, { redirect: true, url: 'https://claude.ai/cb?error=access_denied' })).toBeNull();
    expect(grantedClientOf({ accept: true, oauth_query: query }, new Error('x'))).toBeNull();
    expect(grantedClientOf({ accept: true }, { redirect: true, url: 'https://claude.ai/cb?code=abc' })).toBeNull();
    expect(grantedClientOf({ accept: true, oauth_query: query }, { redirect: true, url: 'not a url' })).toBeNull();
  });
});
