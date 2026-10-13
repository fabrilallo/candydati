import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const VALID_DATABASE_URL = 'postgres://tt:tt@localhost:5434/team_tracker';
const S3 = { S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'team-tracker', S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret' };

describe('loadEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL });

    expect(env.DATABASE_URL).toBe(VALID_DATABASE_URL);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('accepts explicit LOG_LEVEL and NODE_ENV values', () => {
    const env = loadEnv({ ...S3, DATABASE_URL: VALID_DATABASE_URL, LOG_LEVEL: 'debug', NODE_ENV: 'production' });

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
