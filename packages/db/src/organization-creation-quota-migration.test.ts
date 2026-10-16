import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { scratchDatabaseAt, type ScratchDatabase } from './testing/migrations-up-to.js';

describe('0025: organization creation quota and bootstrap owner backfill', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await scratchDatabaseAt(`candydati_creation_quota_${process.pid}_test`, '0024_instance_bootstrap');
    await db.client.query(`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
      ('u_founder', 'F', 'founder@acme.test', true, now() - interval '30 days', now()),
      ('u_two', 'T', 'two@acme.test', true, now() - interval '20 days', now()),
      ('u_admin', 'A', 'admin@acme.test', true, now() - interval '10 days', now()),
      ('u_late', 'L', 'late@acme.test', false, now(), now())`);
    await db.client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES
      ('org_a', 'A', 'a', now() - interval '30 days'), ('org_b', 'B', 'b', now() - interval '5 days'), ('org_c', 'C', 'c', now() - interval '20 days')`);
    await db.client.query(`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
      ('m1', 'org_a', 'u_founder', 'owner', now() - interval '30 days'),
      ('m2', 'org_b', 'u_founder', 'owner', now() - interval '5 days'),
      ('m3', 'org_c', 'u_two', 'owner', now() - interval '20 days'),
      ('m4', 'org_a', 'u_admin', 'admin', now() - interval '10 days')`);
    await db.client.query(`INSERT INTO instance_bootstrap (slot, email, claimed_at) VALUES ('first_owner', 'founder@acme.test', now() - interval '30 days')`);
    await runMigrations(db.url);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('records one creation per current owner: the earliest organization they own', async () => {
    const { rows } = await db.client.query<{ user_id: string; organization_id: string }>('SELECT user_id, organization_id FROM organization_creation_quota ORDER BY user_id');
    expect(rows).toEqual([
      { user_id: 'u_founder', organization_id: 'org_a' },
      { user_id: 'u_two', organization_id: 'org_c' },
    ]);
  });

  it('records the confirmed account of the bootstrap address as the first owner', async () => {
    const { rows } = await db.client.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM instance_bootstrap');
    expect(rows).toEqual([{ owner_user_id: 'u_founder' }]);
  });
});
