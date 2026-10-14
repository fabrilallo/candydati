import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
import { PRODUCTION_ENV as PRODUCTION } from '../testing/production-env.js';

const messageOf = (source: Record<string, string>): string => {
  try {
    parseEnv(source);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe('parseEnv in production: secrets', () => {
  it('accepts strong secrets', () => {
    expect(parseEnv(PRODUCTION).NODE_ENV).toBe('production');
  });

  it.each([
    ['BETTER_AUTH_SECRET', 'change-me-at-least-32-characters-long'],
    ['INBOUND_WEBHOOK_SECRET', 'change-me-webhook-secret-at-least-32-chars'],
    ['S3_SECRET_KEY', 'tt-minio-secret'],
    ['BETTER_AUTH_SECRET', 'a'.repeat(40)],
  ])('refuses the weak %s without echoing it', (name, value) => {
    const message = messageOf({ ...PRODUCTION, [name]: value });
    expect(message).toContain(name);
    expect(message).not.toContain(value);
  });

  it('refuses the example database password', () => {
    const message = messageOf({ ...PRODUCTION, DATABASE_URL: 'postgres://tt:change-me-postgres-password@postgres:5432/x' });
    expect(message).toMatch(/DATABASE_URL: the password/);
    expect(message).not.toContain('change-me-postgres');
  });

  it('lets weak secrets through outside production (development defaults)', () => {
    expect(() => parseEnv({ ...PRODUCTION, NODE_ENV: 'development', BETTER_AUTH_SECRET: 'change-me-at-least-32-characters-long' })).not.toThrow();
  });
});

describe('parseEnv in production: transport and email', () => {
  it('requires https for BETTER_AUTH_URL and PLATFORM_URL (Secure cookies)', () => {
    expect(messageOf({ ...PRODUCTION, BETTER_AUTH_URL: 'http://ats.example.org' })).toMatch(/BETTER_AUTH_URL.*https/);
    expect(messageOf({ ...PRODUCTION, PLATFORM_URL: 'http://ats.example.org' })).toMatch(/PLATFORM_URL.*https/);
  });

  it('refuses EMAIL_PROVIDER=log, which would silently drop every email', () => {
    expect(messageOf({ ...PRODUCTION, EMAIL_PROVIDER: 'log' })).toMatch(/EMAIL_PROVIDER/);
    const { EMAIL_PROVIDER: _unset, ...withoutProvider } = PRODUCTION;
    expect(messageOf(withoutProvider)).toMatch(/EMAIL_PROVIDER/);
  });
});

describe('parseEnv SIGNUP_MODE', () => {
  it('defaults to invite_only in production and open elsewhere', () => {
    expect(parseEnv(PRODUCTION).SIGNUP_MODE).toBe('invite_only');
    expect(parseEnv({ ...PRODUCTION, NODE_ENV: 'development' }).SIGNUP_MODE).toBe('open');
    expect(parseEnv({ ...PRODUCTION, SIGNUP_MODE: 'open' }).SIGNUP_MODE).toBe('open');
    expect(messageOf({ ...PRODUCTION, SIGNUP_MODE: 'closed' })).toMatch(/SIGNUP_MODE/);
  });
});

describe('parseEnv limits of API keys, MCP and the assistant', () => {
  it('has defaults and bounds', () => {
    expect(parseEnv(PRODUCTION)).toMatchObject({
      API_KEY_DEFAULT_TTL_DAYS: 90,
      MCP_MODEL_DAILY_BUDGET_PER_KEY: 200,
      MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION: 1000,
      ASSISTANT_DAILY_BUDGET_PER_USER: 200,
      ASSISTANT_DAILY_BUDGET_PER_ORGANIZATION: 2000,
    });
    expect(parseEnv({ ...PRODUCTION, API_KEY_DEFAULT_TTL_DAYS: '30' }).API_KEY_DEFAULT_TTL_DAYS).toBe(30);
    expect(messageOf({ ...PRODUCTION, API_KEY_DEFAULT_TTL_DAYS: '366' })).toMatch(/API_KEY_DEFAULT_TTL_DAYS/);
  });
});
