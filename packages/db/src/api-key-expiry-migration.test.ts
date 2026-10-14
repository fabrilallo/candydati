import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate.js';
import { maintenanceDatabaseUrl, testDatabaseUrl } from './testing/test-database.js';

interface JournalEntry {
  readonly tag: string;
}

/** The real migrations up to and including `lastTag`: the database as an instance of the previous release has it. */
const migrationsUpTo = (lastTag: string): string => {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  const entries = journal.entries.slice(0, last + 1);
  const folder = mkdtempSync(join(tmpdir(), 'tt-migrations-upto-'));
  mkdirSync(join(folder, 'meta'));
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) copyFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  return folder;
};

const DAY_MS = 86_400_000;

describe('api_key.expires_at backfill (keys created before every key expired)', () => {
  const scratchName = `tt_key_expiry_${process.pid}_test`;
  const admin = new pg.Client({ connectionString: maintenanceDatabaseUrl(testDatabaseUrl()) });
  let client: pg.Client;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${scratchName}"`);
    const parsed = new URL(testDatabaseUrl());
    parsed.pathname = `/${scratchName}`;
    const url = parsed.toString();
    await runMigrations(url, migrationsUpTo('0022_auth_security'));
    client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org_1', 'Org', 'org-1', now())`);
    await client.query(`INSERT INTO api_key (id, organization_id, name, prefix, hash, scopes, created_by, created_at, expires_at) VALUES
      ('recent', 'org_1', 'CI', 'Recent01', 'h', '{job:read}', 'u1', now() - interval '10 days', NULL),
      ('ancient', 'org_1', 'CI', 'Ancient1', 'h', '{job:read}', 'u1', now() - interval '400 days', NULL),
      ('dated', 'org_1', 'CI', 'Dated001', 'h', '{job:read}', 'u1', now(), '2030-01-01T00:00:00Z')`);
    await runMigrations(url);
  });

  afterAll(async () => {
    await client.end();
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.end();
  });

  it('gives every key without an expiry its creation date plus the default 90 days, never more than a year from now', async () => {
    const { rows } = await client.query<{ id: string; created_at: Date; expires_at: Date }>('SELECT id, created_at, expires_at FROM api_key ORDER BY id');
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId.recent!.expires_at.getTime() - byId.recent!.created_at.getTime()).toBe(90 * DAY_MS);
    expect(byId.ancient!.expires_at.getTime()).toBeLessThan(Date.now());
    expect(byId.dated!.expires_at.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    for (const row of [byId.recent!, byId.ancient!]) expect(row.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 365 * DAY_MS);
  });

  it('makes the column NOT NULL afterwards', async () => {
    const { rows } = await client.query<{ is_nullable: string }>(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'api_key' AND column_name = 'expires_at'`);
    expect(rows[0]?.is_nullable).toBe('NO');
  });
});
