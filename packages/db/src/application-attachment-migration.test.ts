import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { scratchDatabaseAt, type ScratchDatabase } from './testing/migrations-up-to.js';

describe('0033-0034: attachments and answers on a database with data', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await scratchDatabaseAt(`candydati_attachments_${process.pid}_test`, '0032_tracked_links');
    await db.client.query(`INSERT INTO organization (id, name, slug, created_at) VALUES ('org', 'O', 'o', now())`);
    await db.client.query(`INSERT INTO job (id, organization_id, slug, title, content, created_by) VALUES ('j', 'org', 'j', 'T', '{}', 'u')`);
    await db.client.query(`INSERT INTO candidate (id, organization_id, first_name, last_name, email, retention_expires_at) VALUES ('c', 'org', 'A', 'B', 'a@b.it', now())`);
    await db.client.query(`INSERT INTO application (id, organization_id, job_id, candidate_id, stage_id, cv_key, cv_file_name, cv_media_type, cv_size_bytes, consent, retention_expires_at, source)
      VALUES ('a', 'org', 'j', 'c', 'received', 'k', 'cv.pdf', 'application/pdf', 1, '{}', now(), 'careers_page')`);
    await runMigrations(db.url);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('leaves existing applications without answers and every constraint validated', async () => {
    const { rows } = await db.client.query(`SELECT answers FROM application`);
    expect(rows).toEqual([{ answers: null }]);
    const { rows: invalid } = await db.client.query(`SELECT conname FROM pg_constraint WHERE NOT convalidated`);
    expect(invalid).toEqual([]);
    const { rows: attachments } = await db.client.query(`SELECT count(*)::int AS n FROM application_attachment`);
    expect(attachments).toEqual([{ n: 0 }]);
  });
});
