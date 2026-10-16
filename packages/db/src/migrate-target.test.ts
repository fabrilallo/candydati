import { describe, expect, it } from 'vitest';
import { DEV_DATABASE_URL, migrationDatabaseUrl } from './migrate-target.js';

describe('migrationDatabaseUrl', () => {
  it('uses DATABASE_URL when set', () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: 'postgres://u:p@db:5432/app' })).toBe('postgres://u:p@db:5432/app');
  });

  it('falls back to the local docker-compose database', () => {
    expect(migrationDatabaseUrl({})).toBe(DEV_DATABASE_URL);
    expect(migrationDatabaseUrl({ DATABASE_URL: '  ' })).toBe(DEV_DATABASE_URL);
  });

  it('refuses a value that is not a postgres url', () => {
    expect(() => migrationDatabaseUrl({ DATABASE_URL: 'mysql://db/app' })).toThrow(/DATABASE_URL/);
    expect(() => migrationDatabaseUrl({ DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/);
  });
});
