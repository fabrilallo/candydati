import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, candidate, candidateNote, cvExtraction, job, organization, privacyNotice } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;

const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};
const insertJob = async (organizationId: string): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(job).values({ id, organizationId, slug: id, title: 'T', content: {} as never, createdBy: 'u' });
  return id;
};
const insertCandidate = async (organizationId: string, email: string): Promise<string> => {
  const id = randomUUID();
  await handle.db
    .insert(candidate)
    .values({ id, organizationId, firstName: 'Ada', lastName: 'Lovelace', email, retentionExpiresAt: NOW });
  return id;
};
const insertApplication = async (organizationId: string, jobId: string, candidateId: string, outcome: 'hired' | null = null) => {
  const id = randomUUID();
  await handle.db.insert(application).values({
    id,
    organizationId,
    jobId,
    candidateId,
    stageId: 'received',
    outcome,
    cvKey: 'k',
    cvFileName: 'cv.pdf',
    cvMediaType: 'application/pdf',
    cvSizeBytes: 10,
    consent,
    retentionExpiresAt: NOW,
    source: 'careers_page',
  });
  return id;
};

describe('candidate tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('creates all tables', async () => {
    const { rows } = await handle.pool.query(`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['privacy_notice', 'candidate', 'application', 'candidate_note', 'cv_extraction']));
  });

  it('keeps privacy notice versions unique per organization', async () => {
    const a = await insertOrg();
    const b = await insertOrg();
    const values = (organizationId: string) => ({
      id: randomUUID(),
      organizationId,
      version: 1,
      language: 'it' as const,
      text: 't',
      contactEmail: 'p@x.it',
      retentionDays: { selection: 365, talent_pool: 730 },
      createdBy: 'u',
    });
    await handle.db.insert(privacyNotice).values(values(a));
    await expect(handle.db.insert(privacyNotice).values(values(a))).rejects.toThrow();
    await expect(handle.db.insert(privacyNotice).values(values(b))).resolves.toBeDefined();
  });

  it('applies candidate defaults and rejects emails differing only by case', async () => {
    const org = await insertOrg();
    const id = await insertCandidate(org, 'Ada@Example.com');
    const [row] = await handle.db.select().from(candidate).where(eq(candidate.id, id));
    expect(row).toMatchObject({ tags: [], talentPool: false, phone: null });
    await expect(insertCandidate(org, 'ada@example.COM')).rejects.toThrow();
    await expect(insertCandidate(await insertOrg(), 'ada@example.com')).resolves.toBeDefined();
  });

  it('allows one open application per job and candidate, but a new one after a decision', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const cand = await insertCandidate(org, 'a@x.it');
    await insertApplication(org, jobId, cand);
    await expect(insertApplication(org, jobId, cand)).rejects.toThrow();
    await expect(insertApplication(org, jobId, cand, 'hired')).resolves.toBeDefined();
    const other = await insertJob(org);
    await expect(insertApplication(org, other, cand)).resolves.toBeDefined();
  });

  it('refuses to delete an organization, job or candidate that has applications', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const cand = await insertCandidate(org, 'b@x.it');
    await insertApplication(org, jobId, cand);
    for (const [table, id] of [['organization', org], ['job', jobId], ['candidate', cand]] as const) {
      await expect(handle.pool.query(`delete from ${table} where id = $1`, [id])).rejects.toThrow();
    }
  });

  it('stores notes with an optional application', async () => {
    const org = await insertOrg();
    const cand = await insertCandidate(org, 'c@x.it');
    await handle.db.insert(candidateNote).values({ id: randomUUID(), organizationId: org, candidateId: cand, authorId: 'u', body: 'hi' });
    const [row] = await handle.db.select().from(candidateNote).where(eq(candidateNote.candidateId, cand));
    expect(row).toMatchObject({ applicationId: null, body: 'hi' });
  });

  it('generates the search vector from the CV text and cascades with the application', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const cand = await insertCandidate(org, 'd@x.it');
    const app = await insertApplication(org, jobId, cand);
    await handle.db
      .insert(cvExtraction)
      .values({ applicationId: app, organizationId: org, status: 'text_only', text: 'Senior Kubernetes engineer', source: 'text' });
    const hit = await handle.db
      .select({ id: cvExtraction.applicationId })
      .from(cvExtraction)
      .where(sql`${cvExtraction.search} @@ plainto_tsquery('simple', 'kubernetes')`);
    expect(hit).toEqual([{ id: app }]);
    const miss = await handle.db
      .select()
      .from(cvExtraction)
      .where(sql`${cvExtraction.search} @@ plainto_tsquery('simple', 'cobol')`);
    expect(miss).toEqual([]);
    await handle.pool.query('delete from cv_extraction where application_id = $1', [app]);
  });
});
