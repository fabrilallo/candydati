import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { maintenanceDatabaseUrl, testDatabaseUrl } from './testing/test-database.js';

interface Step {
  readonly tag: string;
  readonly sql: string;
}

/** Writes a throwaway migrations folder (journal plus sql files) and returns its path. */
let clock = 1_700_000_000_000;
const makeFolder = (steps: readonly Step[]): string => {
  clock += 100_000;
  const base = clock;
  const folder = mkdtempSync(join(tmpdir(), 'tt-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const entries = steps.map((step, idx) => ({
    idx,
    version: '7',
    when: base + idx * 1000,
    tag: step.tag,
    breakpoints: true,
  }));
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'postgresql', entries }));
  for (const step of steps) writeFileSync(join(folder, `${step.tag}.sql`), step.sql);
  return folder;
};

describe('runMigrations', () => {
  const scratchName = `tt_migrate_${process.pid}_test`;
  const admin = new pg.Client({ connectionString: maintenanceDatabaseUrl(testDatabaseUrl()) });
  let url = '';

  const query = async <T extends pg.QueryResultRow>(text: string): Promise<T[]> => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query<T>(text)).rows;
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${scratchName}"`);
    const parsed = new URL(testDatabaseUrl());
    parsed.pathname = `/${scratchName}`;
    url = parsed.toString();
  });

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.end();
  });

  it('lets concurrent runners wait for each other instead of racing', async () => {
    const folder = makeFolder([
      { tag: '0000_slow', sql: 'CREATE TABLE "race" ("id" integer);--> statement-breakpoint\nSELECT pg_sleep(0.6);' },
      { tag: '0001_more', sql: 'INSERT INTO "race" ("id") VALUES (1);' },
    ]);
    const results = await Promise.allSettled([runMigrations(url, folder), runMigrations(url, folder)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await query('SELECT id FROM "race"')).toHaveLength(1);
    expect(await query('SELECT id FROM drizzle."__drizzle_migrations"')).toHaveLength(2);
  });

  it('commits each migration on its own: a failing one leaves the previous ones applied', async () => {
    const good = { tag: '0000_ok', sql: 'CREATE TABLE "kept" ("id" integer);' };
    const bad = {
      tag: '0001_bad',
      sql: 'CREATE TABLE "lost" ("id" integer);--> statement-breakpoint\nSELECT 1/0;',
    };
    await expect(runMigrations(url, makeFolder([good, bad]))).rejects.toThrow();
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name IN ('kept','lost')`,
    );
    expect(tables.map((t) => t.table_name)).toEqual(['kept']);
  });

  it('releases the lock after a failure so a later run is not blocked', async () => {
    const folder = makeFolder([{ tag: '0000_ok2', sql: 'SELECT 1;' }]);
    await expect(runMigrations(url, folder)).resolves.toBeUndefined();
  });

  it('runs CONCURRENTLY migrations outside a transaction', async () => {
    const folder = makeFolder([
      { tag: '0000_t', sql: 'CREATE TABLE "idx_t" ("a" integer);' },
      { tag: '0001_i', sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_t_a" ON "idx_t" ("a");' },
    ]);
    await runMigrations(url, folder);
    const idx = await query(`SELECT indexname FROM pg_indexes WHERE indexname = 'idx_t_a'`);
    expect(idx).toHaveLength(1);
  });
});
