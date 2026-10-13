import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, candidate, consentToken, importAnalysis, importBatch, importItem, job, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;
const counts = { files: 0, cvs: 0, rows: 0, items: 0, included: 0, imported: 0, merged: 0, failed: 0, noEmail: 0, emailsQueued: 0, skippedReconfirmed: 0, erased: 0 };

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
const insertBatch = async (organizationId: string, jobId: string): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(importBatch).values({ id, organizationId, jobId, stageId: 'received', status: 'uploaded', createdBy: 'u', counts });
  return id;
};
const insertCandidate = async (organizationId: string, batchId: string | null = null): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(candidate).values({ id, organizationId, firstName: 'A', lastName: 'B', email: `${id}@x.it`, retentionExpiresAt: NOW, importBatchId: batchId });
  return id;
};

describe('import tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('stores a batch with defaults for headers and source files', async () => {
    const org = await insertOrg();
    const id = await insertBatch(org, await insertJob(org));
    const [row] = await handle.db.select().from(importBatch).where(eq(importBatch.id, id));
    expect(row).toMatchObject({ status: 'uploaded', headers: [], sourceFiles: [], mapping: null, importedAt: null, undoneAt: null, error: null, counts });
  });

  it('keeps items unique by batch position and stores the payload as json', async () => {
    const org = await insertOrg();
    const batchId = await insertBatch(org, await insertJob(org));
    const payload = { confidence: 'high', basis: 'single', candidate: { firstName: 'A', lastName: 'B', email: 'a@b.it', phone: null, linkedinUrl: null, tags: [], note: null }, cv: null, headline: null, sources: { rows: [], files: [] }, existing: null, conflicts: [], flags: [] } as never;
    await handle.db.insert(importItem).values({ id: randomUUID(), organizationId: org, batchId, position: 0, included: true, confidence: 'high', payload });
    const [item] = await handle.db.select().from(importItem).where(eq(importItem.batchId, batchId));
    expect(item).toMatchObject({ status: 'pending', error: null, included: true });
    await expect(handle.db.insert(importItem).values({ id: randomUUID(), organizationId: org, batchId, position: 0, included: true, confidence: 'high', payload })).rejects.toThrow();
    await handle.db.insert(importAnalysis).values({ batchId, organizationId: org, data: { cvs: [], rows: [] } });
    expect((await handle.db.select().from(importAnalysis).where(eq(importAnalysis.batchId, batchId)))).toHaveLength(1);
  });

  it('backfills existing applications as given, without batch', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const candidateId = await insertCandidate(org);
    const id = randomUUID();
    // Same statement an application written before this migration would have: no consent_status, no import_batch_id.
    await handle.pool.query(
      `insert into application (id, organization_id, job_id, candidate_id, stage_id, cv_key, cv_file_name, cv_media_type, cv_size_bytes, consent, retention_expires_at, source)
       values ($1, $2, $3, $4, 'received', 'k', 'cv.pdf', 'application/pdf', 1, $5, $6, 'careers_page')`,
      [id, org, jobId, candidateId, JSON.stringify(consent), NOW],
    );
    const [row] = await handle.db.select().from(application).where(eq(application.id, id));
    expect(row).toMatchObject({ consentStatus: 'given', importBatchId: null });
    const [person] = await handle.db.select().from(candidate).where(eq(candidate.id, candidateId));
    expect(person?.importBatchId).toBeNull();
  });

  it('links candidates and applications to their batch and refuses unknown batches', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const batchId = await insertBatch(org, jobId);
    const candidateId = await insertCandidate(org, batchId);
    const id = randomUUID();
    await handle.db.insert(application).values({ id, organizationId: org, jobId, candidateId, stageId: 'received', cvKey: 'k', cvFileName: 'c.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1, consent, consentStatus: 'to_renew', importBatchId: batchId, retentionExpiresAt: NOW, source: 'import' });
    const [row] = await handle.db.select().from(application).where(eq(application.id, id));
    expect(row).toMatchObject({ consentStatus: 'to_renew', importBatchId: batchId, source: 'import' });
    await expect(insertCandidate(org, 'no-such-batch')).rejects.toThrow();
  });

  it('stores the hash of a consent token for an application, one per hash', async () => {
    const org = await insertOrg();
    const jobId = await insertJob(org);
    const candidateId = await insertCandidate(org);
    const applicationId = randomUUID();
    await handle.db.insert(application).values({ id: applicationId, organizationId: org, jobId, candidateId, stageId: 'received', cvKey: 'k', cvFileName: 'c.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1, consent, retentionExpiresAt: NOW, source: 'import' });
    const tokenHash = randomUUID();
    await handle.db.insert(consentToken).values({ tokenHash, organizationId: org, applicationId, expiresAt: NOW });
    const [row] = await handle.db.select().from(consentToken).where(eq(consentToken.tokenHash, tokenHash));
    expect(row).toMatchObject({ usedAt: null, applicationId });
    await expect(handle.db.insert(consentToken).values({ tokenHash, organizationId: org, applicationId, expiresAt: NOW })).rejects.toThrow();
    // Restrict: an application cannot disappear while its token row exists.
    await expect(handle.db.delete(application).where(eq(application.id, applicationId))).rejects.toThrow();
  });
});
