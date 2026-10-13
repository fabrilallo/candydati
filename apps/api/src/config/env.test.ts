import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://tt:tt@localhost:5434/team_tracker',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'team-tracker-test',
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
    expect(env.platform.name).toBe('team-tracker');
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
    expect(parseEnv(valid).s3).toMatchObject({ endpoint: 'http://localhost:9000', bucket: 'team-tracker-test', forcePathStyle: false });
  });

  it('is required and names the variable, never the value', () => {
    const { S3_SECRET_KEY: _omitted, ...without } = valid;
    expect(() => parseEnv(without)).toThrow(/S3_SECRET_KEY/);
    expect(() => parseEnv({ ...valid, S3_ENDPOINT: 'nope', S3_SECRET_KEY: 'topsecret' })).not.toThrow(/topsecret/);
  });
});
