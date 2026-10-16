import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
import { PRODUCTION_ENV } from '../testing/production-env.js';

const valid = {
  DATABASE_URL: 'postgres://candydati:candydati@localhost:5434/candydati',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'candydati-test',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

describe('parseEnv FAST_MODEL', () => {
  it('is optional, empty counts as unset, and must be provider/model', () => {
    expect(parseEnv(valid).FAST_MODEL).toBeUndefined();
    expect(parseEnv({ ...valid, FAST_MODEL: '' }).FAST_MODEL).toBeUndefined();
    expect(parseEnv({ ...valid, FAST_MODEL: 'openai/some-model' }).FAST_MODEL).toBe('openai/some-model');
    expect(() => parseEnv({ ...valid, FAST_MODEL: 'just-a-name' })).toThrow(/FAST_MODEL/);
  });
});

describe('parseEnv WEBHOOKS_ALLOW_PRIVATE', () => {
  it('is accepted outside production and refused in production', () => {
    expect(parseEnv({ ...valid, WEBHOOKS_ALLOW_PRIVATE: 'true' }).WEBHOOKS_ALLOW_PRIVATE).toBe(true);
    expect(parseEnv({ ...valid, NODE_ENV: 'test', WEBHOOKS_ALLOW_PRIVATE: 'true' }).WEBHOOKS_ALLOW_PRIVATE).toBe(true);
    expect(() => parseEnv({ ...PRODUCTION_ENV, WEBHOOKS_ALLOW_PRIVATE: 'true' })).toThrow(/WEBHOOKS_ALLOW_PRIVATE.*production/);
    expect(parseEnv(PRODUCTION_ENV).WEBHOOKS_ALLOW_PRIVATE).toBe(false);
  });
});

describe('parseEnv TRUST_PROXY and daily caps', () => {
  it('defaults to loopback only, and reads a hop count or a list', () => {
    expect(parseEnv(valid).TRUST_PROXY).toEqual(['loopback']);
    expect(parseEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(parseEnv({ ...valid, TRUST_PROXY: '10.0.0.0/8,loopback' }).TRUST_PROXY).toEqual(['10.0.0.0/8', 'loopback']);
    expect(() => parseEnv({ ...valid, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('caps public applications per day by default at 500 per organization and 200 per job', () => {
    expect(parseEnv(valid)).toMatchObject({ APPLICATIONS_DAILY_MAX_PER_ORGANIZATION: 500, APPLICATIONS_DAILY_MAX_PER_JOB: 200 });
    expect(parseEnv({ ...valid, APPLICATIONS_DAILY_MAX_PER_JOB: '50' }).APPLICATIONS_DAILY_MAX_PER_JOB).toBe(50);
    expect(() => parseEnv({ ...valid, APPLICATIONS_DAILY_MAX_PER_JOB: '0' })).toThrow(/APPLICATIONS_DAILY_MAX_PER_JOB/);
  });
});

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      API_PORT: 4000,
      API_HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
      RUN_MIGRATIONS: true,
      TRUSTED_ORIGINS: [],
    });
    expect(env.platform.name).toBe('Candydati');
  });

  it('treats empty strings as unset (a blank line in .env)', () => {
    const env = parseEnv({ ...valid, TRUSTED_ORIGINS: '', API_PORT: '', PLATFORM_NAME: '' });
    expect(env.TRUSTED_ORIGINS).toEqual([]);
    expect(env.API_PORT).toBe(4000);
  });

  it('parses the comma-separated trusted origins and coerces the port', () => {
    const env = parseEnv({ ...valid, TRUSTED_ORIGINS: 'https://a.example.com, https://b.example.com ,', API_PORT: '4100' });
    expect(env.TRUSTED_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(env.API_PORT).toBe(4100);
  });

  it.each(['false', '0', 'off', 'no', 'FALSE'])('reads RUN_MIGRATIONS=%s as off', (value) => {
    expect(parseEnv({ ...valid, RUN_MIGRATIONS: value }).RUN_MIGRATIONS).toBe(false);
  });

  it('reads the platform configuration through loadPlatformConfig', () => {
    const env = parseEnv({ ...valid, PLATFORM_NAME: 'Acme ATS', PLATFORM_URL: 'https://ats.example.com/' });
    expect(env.platform).toMatchObject({ name: 'Acme ATS', url: 'https://ats.example.com' });
  });

  it('fails fast listing every problem, without echoing the secret', () => {
    const secret = 'too-short-secret';
    let message = '';
    try {
      parseEnv({ BETTER_AUTH_SECRET: secret, WEB_ORIGIN: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Invalid environment');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('BETTER_AUTH_SECRET');
    expect(message).toContain('BETTER_AUTH_URL');
    expect(message).toContain('WEB_ORIGIN');
    expect(message).not.toContain(secret);
  });

  it('rejects invalid trusted origins, log levels and an invalid platform config', () => {
    expect(() => parseEnv({ ...valid, TRUSTED_ORIGINS: 'not a url' })).toThrow(/TRUSTED_ORIGINS/);
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
    expect(() => parseEnv({ ...valid, PLATFORM_DEFAULT_LOCALE: 'fr' })).toThrow(/platform/i);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseEnv(valid))).toBe(true);
  });
});

describe('parseEnv S3', () => {
  it('parses the storage settings', () => {
    expect(parseEnv(valid).s3).toMatchObject({ endpoint: 'http://localhost:9000', bucket: 'candydati-test', forcePathStyle: false });
  });

  it('is required and names the variable, never the value', () => {
    const { S3_SECRET_KEY: _omitted, ...without } = valid;
    expect(() => parseEnv(without)).toThrow(/S3_SECRET_KEY/);
    expect(() => parseEnv({ ...valid, S3_ENDPOINT: 'nope', S3_SECRET_KEY: 'topsecret' })).not.toThrow(/topsecret/);
  });
});

describe('parseEnv email', () => {
  it('reads the email settings and requires the webhook secret only in production', () => {
    expect(parseEnv(valid).email.transport.kind).toBe('log');
    expect(parseEnv({ ...valid, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '1025' }).email.transport).toMatchObject({ kind: 'smtp', port: 1025 });
    const { INBOUND_WEBHOOK_SECRET: _secret, ...withoutSecret } = PRODUCTION_ENV;
    expect(() => parseEnv(withoutSecret)).toThrow(/INBOUND_WEBHOOK_SECRET/);
    expect(parseEnv(PRODUCTION_ENV).email.webhookSecret).toHaveLength(32);
    expect(() => parseEnv({ ...valid, INBOUND_WEBHOOK_SECRET: 'short' })).toThrow(/INBOUND_WEBHOOK_SECRET/);
  });
});

describe('parseEnv BOOTSTRAP_TOKEN', () => {
  it('is optional and, when set, at least 32 characters', () => {
    expect(parseEnv(valid).BOOTSTRAP_TOKEN).toBeUndefined();
    expect(parseEnv({ ...valid, BOOTSTRAP_TOKEN: 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5' }).BOOTSTRAP_TOKEN).toBe('Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5');
    expect(() => parseEnv({ ...valid, BOOTSTRAP_TOKEN: 'short' })).toThrow(/BOOTSTRAP_TOKEN/);
  });
});

describe('parseEnv ORGANIZATION_CREATION', () => {
  it('defaults to one organization per person when invite only, unrestricted when sign-up is open', () => {
    expect(parseEnv(valid).ORGANIZATION_CREATION).toBe('open');
    expect(parseEnv({ ...valid, SIGNUP_MODE: 'invite_only' }).ORGANIZATION_CREATION).toBe('one_per_user');
    expect(parseEnv(PRODUCTION_ENV).ORGANIZATION_CREATION).toBe('one_per_user');
  });

  it('accepts instance admins by address, normalised', () => {
    const env = parseEnv({ ...valid, ORGANIZATION_CREATION: 'instance_admins', INSTANCE_ADMIN_EMAILS: ' Ops@Acme.example , cto@acme.example' });
    expect(env.ORGANIZATION_CREATION).toBe('instance_admins');
    expect(env.INSTANCE_ADMIN_EMAILS).toEqual(['ops@acme.example', 'cto@acme.example']);
    expect(() => parseEnv({ ...valid, ORGANIZATION_CREATION: 'everyone' })).toThrow(/ORGANIZATION_CREATION/);
  });
});

describe('parseEnv MCP_MODEL_DAILY_BUDGET_PER_USER', () => {
  it('has a per-person default', () => {
    expect(parseEnv(valid).MCP_MODEL_DAILY_BUDGET_PER_USER).toBe(300);
  });
});
