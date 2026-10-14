import { describe, expect, it } from 'vitest';
import { databasePasswordOf, productionSecretIssues, weakSecretReason } from './secrets.js';
import { productionIssues } from './production.js';

const STRONG_32 = 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5';
const STRONG_16 = 'r7Kp2XwN9vLq4TsB';

describe('weakSecretReason', () => {
  it('accepts a random value of the minimum length', () => {
    expect(weakSecretReason(STRONG_32, 32)).toBeNull();
    expect(weakSecretReason(STRONG_16, 16)).toBeNull();
    expect(weakSecretReason('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9', 32)).toBeNull();
  });

  it('refuses short values', () => {
    expect(weakSecretReason(STRONG_16, 32)).toMatch(/at least 32/);
  });

  it('refuses the example values of .env.example, whatever their length', () => {
    expect(weakSecretReason('change-me-at-least-32-characters-long', 32)).toMatch(/example/);
    expect(weakSecretReason('change-me-webhook-secret-at-least-32-chars', 32)).toMatch(/example/);
    expect(weakSecretReason('CHANGEME-postgres-password-very-long', 16)).toMatch(/example/);
    expect(weakSecretReason('tt-minio-secret-tt-minio-secret', 16)).toMatch(/example/);
  });

  it('refuses low entropy values', () => {
    expect(weakSecretReason('a'.repeat(40), 32)).toMatch(/random/);
    expect(weakSecretReason('passwordpassword', 16)).toMatch(/random/);
    expect(weakSecretReason('abababababababababababababababab', 32)).toMatch(/random/);
  });
});

describe('databasePasswordOf', () => {
  it('reads the decoded password of a postgres URL, or null', () => {
    expect(databasePasswordOf('postgres://tt:s%40cret@db:5432/x')).toBe('s@cret');
    expect(databasePasswordOf('postgres://tt@db:5432/x')).toBeNull();
    expect(databasePasswordOf('not a url')).toBeNull();
  });
});

describe('productionSecretIssues', () => {
  it('names each weak variable and never its value', () => {
    const issues = productionSecretIssues({ BETTER_AUTH_SECRET: 'change-me-at-least-32-characters-long', S3_SECRET_KEY: STRONG_16 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^BETTER_AUTH_SECRET: /);
    expect(issues.join()).not.toContain('change-me-at');
  });

  it('checks the password inside DATABASE_URL and skips variables that are not set', () => {
    expect(productionSecretIssues({ DATABASE_URL: 'postgres://tt:tt@db:5432/x' })[0]).toMatch(/^DATABASE_URL: /);
    expect(productionSecretIssues({ DATABASE_URL: `postgres://tt:${STRONG_16}@db:5432/x` })).toEqual([]);
    expect(productionSecretIssues({})).toEqual([]);
  });

  it('checks BOOTSTRAP_TOKEN when it is set (it opens the first owner sign-up)', () => {
    expect(productionSecretIssues({ BOOTSTRAP_TOKEN: 'change-me-bootstrap-token-of-the-instance' })[0]).toMatch(/^BOOTSTRAP_TOKEN: /);
    expect(productionSecretIssues({ BOOTSTRAP_TOKEN: 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5' })).toEqual([]);
  });
});

describe('productionIssues', () => {
  const strong = { BETTER_AUTH_SECRET: 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5', BETTER_AUTH_URL: 'https://a.example', PLATFORM_URL: 'https://a.example', EMAIL_PROVIDER: 'smtp' };

  it('checks nothing outside production', () => {
    expect(productionIssues({ NODE_ENV: 'development', BETTER_AUTH_SECRET: 'x' })).toEqual([]);
  });

  it('wants https origins and a real email provider in production', () => {
    expect(productionIssues({ NODE_ENV: 'production', ...strong })).toEqual([]);
    expect(productionIssues({ NODE_ENV: 'production', ...strong, PLATFORM_URL: 'http://a.example' })[0]).toMatch(/^PLATFORM_URL: /);
    expect(productionIssues({ NODE_ENV: 'production', ...strong, EMAIL_PROVIDER: undefined })[0]).toMatch(/^EMAIL_PROVIDER: /);
    expect(productionIssues({ NODE_ENV: 'production', PLATFORM_URL: 'https://a.example', EMAIL_PROVIDER: 'smtp' }, ['PLATFORM_URL'])).toEqual([]);
  });
});
