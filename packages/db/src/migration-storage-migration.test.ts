import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { scratchDatabaseAt, type ScratchDatabase } from './testing/migrations-up-to.js';

describe('0028-0030: migration storage on a database with data', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await scratchDatabaseAt(`candydati_migration_storage_${process.pid}_test`, '0027_careers_page_revision');
    await db.client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org', 'O', 'o', now())`);
    await db.client.query(`INSERT INTO job (id, organization_id, slug, title, content, created_by) VALUES ('j', 'org', 'j', 'T', '{}', 'u')`);
    await db.client.query(`INSERT INTO candidate (id, organization_id, first_name, last_name, email, retention_expires_at) VALUES ('c', 'org', 'A', 'B', 'a@b.it', now())`);
    await db.client.query(`INSERT INTO application (id, organization_id, job_id, candidate_id, stage_id, cv_key, cv_file_name, cv_media_type, cv_size_bytes, consent, retention_expires_at, source)
      VALUES ('a', 'org', 'j', 'c', 'received', 'k', 'cv.pdf', 'application/pdf', 1, '{}', now(), 'careers_page')`);
    await db.client.query(`INSERT INTO candidate_note (id, organization_id, candidate_id, author_id, body) VALUES ('n', 'org', 'c', 'u', 'b')`);
    await db.client.query(`INSERT INTO message (id, organization_id, application_id, candidate_id, direction, subject, body_text, status) VALUES ('m', 'org', 'a', 'c', 'outbound', 's', 'b', 'sent')`);
    await runMigrations(db.url);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('keeps existing rows as they were: app jobs, live messages, no batch', async () => {
    const { rows: jobs } = await db.client.query(`SELECT origin, migration_batch_id FROM job`);
    expect(jobs).toEqual([{ origin: 'app', migration_batch_id: null }]);
    const { rows: messages } = await db.client.query(`SELECT historical FROM message`);
    expect(messages).toEqual([{ historical: false }]);
  });

  it('leaves every new constraint validated and every new index valid', async () => {
    const { rows: invalid } = await db.client.query(`SELECT conname FROM pg_constraint WHERE NOT convalidated`);
    expect(invalid).toEqual([]);
    const { rows: indexes } = await db.client.query<{ name: string }>(
      `SELECT indexrelid::regclass::text AS name FROM pg_index WHERE NOT indisvalid OR indexrelid::regclass::text LIKE '%outbound%' ORDER BY 1`,
    );
    expect(indexes).toEqual([{ name: 'message_org_candidate_outbound_idx' }]);
  });
});
