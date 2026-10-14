import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { scratchDatabaseAt, type ScratchDatabase } from './testing/migrations-up-to.js';

const DAY_MS = 86_400_000;

describe('api_key.expires_at backfill (keys created before every key expired)', () => {
  let db: ScratchDatabase;
  let client: pg.Client;

  beforeAll(async () => {
    db = await scratchDatabaseAt(`tt_key_expiry_${process.pid}_test`, '0022_auth_security');
    client = db.client;
    await client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org_1', 'Org', 'org-1', now())`);
    await client.query(`INSERT INTO api_key (id, organization_id, name, prefix, hash, scopes, created_by, created_at, expires_at) VALUES
      ('recent', 'org_1', 'CI', 'Recent01', 'h', '{job:read}', 'u1', now() - interval '10 days', NULL),
      ('ancient', 'org_1', 'CI', 'Ancient1', 'h', '{job:read}', 'u1', now() - interval '400 days', NULL),
      ('dated', 'org_1', 'CI', 'Dated001', 'h', '{job:read}', 'u1', now(), '2030-01-01T00:00:00Z')`);
    await runMigrations(db.url);
  });

  afterAll(async () => {
    await db.drop();
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
