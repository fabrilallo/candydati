import { describe, expect, it } from 'vitest';
import { bootstrapTokenFor, deriveSetupCode, firstOwnerSetupNotice } from './first-owner-setup.js';

const SECRET = 'a-better-auth-secret-of-at-least-32-characters';
const env = (overrides: Partial<Parameters<typeof bootstrapTokenFor>[0]> = {}) => ({
  NODE_ENV: 'production' as const,
  SIGNUP_MODE: 'invite_only' as const,
  BETTER_AUTH_SECRET: SECRET,
  BOOTSTRAP_TOKEN: undefined,
  platform: { url: 'https://ats.example.com' },
  ...overrides,
});

describe('deriveSetupCode', () => {
  it('is stable for a secret, differs between secrets and does not contain the secret', () => {
    const code = deriveSetupCode(SECRET);
    expect(deriveSetupCode(SECRET)).toBe(code);
    expect(deriveSetupCode(`${SECRET}x`)).not.toBe(code);
    expect(code).not.toContain(SECRET.slice(0, 8));
  });

  it('is long enough for the bootstrap rule and safe in a URL fragment', () => {
    expect(deriveSetupCode(SECRET)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('bootstrapTokenFor', () => {
  it('uses BOOTSTRAP_TOKEN when the operator set one', () => {
    expect(bootstrapTokenFor(env({ BOOTSTRAP_TOKEN: 'operator-chosen-token-of-32-chars-min' }))).toBe('operator-chosen-token-of-32-chars-min');
  });

  it('derives one from BETTER_AUTH_SECRET in production when none is set', () => {
    expect(bootstrapTokenFor(env())).toBe(deriveSetupCode(SECRET));
  });

  it('stays without a token outside production (the first sign-up of a dev instance needs none)', () => {
    expect(bootstrapTokenFor(env({ NODE_ENV: 'development' }))).toBeNull();
  });
});

describe('firstOwnerSetupNotice', () => {
  it('gives the link with the derived code in the fragment, never in the query', () => {
    const notice = firstOwnerSetupNotice(env(), true);
    expect(notice).toBe(`First owner setup: open https://ats.example.com/signup?setup#code=${deriveSetupCode(SECRET)}`);
  });

  it('points to BOOTSTRAP_TOKEN without printing it when the operator set one', () => {
    const notice = firstOwnerSetupNotice(env({ BOOTSTRAP_TOKEN: 'operator-chosen-token-of-32-chars-min' }), true);
    expect(notice).toBe('First owner setup: open https://ats.example.com/signup?setup#code=<BOOTSTRAP_TOKEN>');
    expect(notice).not.toContain('operator-chosen');
  });

  it('says nothing once the instance has a confirmed account, in open mode or outside production', () => {
    expect(firstOwnerSetupNotice(env(), false)).toBeNull();
    expect(firstOwnerSetupNotice(env({ SIGNUP_MODE: 'open' }), true)).toBeNull();
    expect(firstOwnerSetupNotice(env({ NODE_ENV: 'development' }), true)).toBeNull();
  });

  it('builds the link from a platform URL with a trailing slash', () => {
    expect(firstOwnerSetupNotice(env({ platform: { url: 'https://ats.example.com/' } }), true)).toContain('https://ats.example.com/signup?setup#code=');
  });
});
