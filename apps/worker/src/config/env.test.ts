import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const VALID_DATABASE_URL = 'postgres://tt:tt@localhost:5434/team_tracker';
const S3 = { S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'team-tracker', S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret' };

/** Passes every production rule: strong secrets, https PLATFORM_URL, a real email provider. */
const PRODUCTION = {
  ...S3,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://tt:r7Kp2XwN9vLq4TsB@postgres:5432/team_tracker',
  S3_SECRET_KEY: 'u5Hq9ZpW3kXv7NcR',
  PLATFORM_URL: 'https://ats.example.org',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.org',
  SMTP_PORT: '587',
};

describe('loadEnv in production', () => {
  it('refuses example secrets, http PLATFORM_URL and the log email provider, naming variables only', () => {
    const fails = (patch: Record<string, string | undefined>): string => {
      try {
        loadEnv({ ...PRODUCTION, ...patch });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(fails({})).toBe('');
    expect(fails({ DATABASE_URL: 'postgres://tt:change-me-postgres-password@postgres:5432/x' })).toMatch(/DATABASE_URL/);
    expect(fails({ S3_SECRET_KEY: 'tt-minio-secret' })).toMatch(/S3_SECRET_KEY/);
    expect(fails({ S3_SECRET_KEY: 'tt-minio-secret' })).not.toContain('tt-minio-secret');
    expect(fails({ PLATFORM_URL: 'http://ats.example.org' })).toMatch(/PLATFORM_URL/);
    expect(fails({ EMAIL_PROVIDER: 'log' })).toMatch(/EMAIL_PROVIDER/);
  });
});

describe('loadEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL });

    expect(env.DATABASE_URL).toBe(VALID_DATABASE_URL);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('accepts explicit LOG_LEVEL and NODE_ENV values', () => {
    const env = loadEnv({ ...PRODUCTION, LOG_LEVEL: 'debug' });

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.NODE_ENV).toBe('production');
  });

  it('throws an error naming DATABASE_URL when it is missing', () => {
    expect(() => loadEnv({ ...S3 })).toThrow(/DATABASE_URL/);
  });

  it('treats an empty DATABASE_URL as missing', () => {
    expect(() => loadEnv({ ...S3, DATABASE_URL: '' })).toThrow(/DATABASE_URL: missing/);
  });

  it('rejects a DATABASE_URL that is not a postgres URL without echoing its value', () => {
    const secretUrl = 'mysql://user:super-secret-password@db.internal/team';

    let message = '';
    try {
      loadEnv({ ...S3, DATABASE_URL: secretUrl });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('super-secret-password');
    expect(message).not.toContain(secretUrl);
  });

  it('lists every invalid variable in one error', () => {
    expect(() => loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('returns a frozen object and does not mutate its input', () => {
    const source = { ...S3, DATABASE_URL: VALID_DATABASE_URL };
    const env = loadEnv(source);

    expect(Object.isFrozen(env)).toBe(true);
    expect(source).toEqual({ ...S3, DATABASE_URL: VALID_DATABASE_URL });
  });
});

describe('loadEnv storage and model', () => {
  it('parses S3 and the optional FAST_MODEL', () => {
    const env = loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL, FAST_MODEL: 'openai/some-model' });
    expect(env.s3).toMatchObject({ bucket: 'team-tracker', endpoint: 'http://localhost:9000' });
    expect(env.FAST_MODEL).toBe('openai/some-model');
    expect(loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL, FAST_MODEL: '' }).FAST_MODEL).toBeUndefined();
    expect(() => loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL, FAST_MODEL: 'nope' })).toThrow(/FAST_MODEL/);
  });

  it('requires S3 and names the variable, not its value', () => {
    expect(() => loadEnv({ DATABASE_URL: VALID_DATABASE_URL })).toThrow(/S3_/);
    expect(() => loadEnv({ ...S3, S3_SECRET_KEY: '', DATABASE_URL: VALID_DATABASE_URL })).toThrow(/S3_SECRET_KEY/);
  });
});

describe('loadEnv email', () => {
  const base = { ...S3, DATABASE_URL: VALID_DATABASE_URL };

  it('defaults to the log provider and reads the sender settings', () => {
    expect(loadEnv(base).email.transport.kind).toBe('log');
    const env = loadEnv({ ...base, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '1025', EMAIL_DOMAIN: 'mail.example', PLATFORM_NAME: 'P' });
    expect(env.email).toMatchObject({ transport: { kind: 'smtp', port: 1025 }, domain: 'mail.example' });
    expect(env.platform.name).toBe('P');
  });

  it('names the missing variable, not its value', () => {
    expect(() => loadEnv({ ...base, EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });
});

describe('loadEnv webhooks', () => {
  const base = { ...S3, DATABASE_URL: VALID_DATABASE_URL };

  it('allows private webhook targets only on an explicit true', () => {
    expect(loadEnv(base).WEBHOOKS_ALLOW_PRIVATE).toBe(false);
    expect(loadEnv({ ...base, WEBHOOKS_ALLOW_PRIVATE: 'true' }).WEBHOOKS_ALLOW_PRIVATE).toBe(true);
    expect(loadEnv({ ...base, WEBHOOKS_ALLOW_PRIVATE: 'yes' }).WEBHOOKS_ALLOW_PRIVATE).toBe(false);
  });

  it('refuses private webhook targets in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', WEBHOOKS_ALLOW_PRIVATE: 'true' })).toThrow(/WEBHOOKS_ALLOW_PRIVATE.*production/);
    expect(loadEnv(PRODUCTION).WEBHOOKS_ALLOW_PRIVATE).toBe(false);
  });

  it('budgets the model at 1000 extractions per organization and day unless told otherwise', () => {
    expect(loadEnv(base).CV_MODEL_DAILY_BUDGET).toBe(1000);
    expect(loadEnv({ ...base, CV_MODEL_DAILY_BUDGET: '25' }).CV_MODEL_DAILY_BUDGET).toBe(25);
    expect(() => loadEnv({ ...base, CV_MODEL_DAILY_BUDGET: '0' })).toThrow(/CV_MODEL_DAILY_BUDGET/);
  });
});
