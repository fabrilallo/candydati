import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachmentKey } from '@candydati/domain';
import { buildApplication, buildCandidate, buildJob } from '../testing/index.js';
import { createDrizzleApplications, toAttachment } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMigratedRows } from './drizzle-migrated-rows.js';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const batchId = randomUUID();
  await handle.db.insert(schema.migrationBatch).values({ id: batchId, organizationId: org, status: 'done', sourceSystem: 's', producer: 'p', connectorMaturity: 'package', createdBy: 'u', packageKey: 'k' });
  const rows = createDrizzleMigratedRows(handle.db);
  const job = async (status: 'draft' | 'closed' | 'published') => {
    const value = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status });
    await rows.insertJob(batchId, value);
    return value.id;
  };
  return { org, batchId, rows, job };
}

describe('migrated rows: deleting the jobs of an undone migration', () => {
  it('deletes a migrated job nothing refers to, never a published one nor one of another batch or organization', async () => {
    const { org, batchId, rows, job } = await world();
    const [draft, published, other] = [await job('draft'), await job('published'), await job('closed')];
    expect(await rows.jobIdsOf(org, batchId)).toEqual([draft, published, other].toSorted());
    expect(await rows.deleteJobIfUnused(org, randomUUID(), other)).toBe(false);
    expect(await rows.deleteJobIfUnused(randomUUID(), batchId, other)).toBe(false);
    expect(await rows.deleteJobIfUnused(org, batchId, published)).toBe(false);
    expect(await rows.deleteJobIfUnused(org, batchId, draft)).toBe(true);
    expect(await createDrizzleJobs(handle.db).findById(org, draft)).toBeNull();
    const [stored] = await handle.db.select({ origin: schema.job.origin }).from(schema.job).where(eq(schema.job.id, other));
    expect(stored?.origin).toBe('migration');
  });

  it('keeps a job still referenced elsewhere, inside a transaction that goes on', async () => {
    const { org, batchId, job } = await world();
    const closed = await job('closed');
    await handle.db.insert(schema.jobTeamMember).values({ organizationId: org, jobId: closed, userId: 'u1', role: 'recruiter', addedBy: 'u1' });
    const outcome = await handle.db.transaction(async (tx) => {
      const deleted = await createDrizzleMigratedRows(tx).deleteJobIfUnused(org, batchId, closed);
      return { deleted, stillUsable: await createDrizzleJobs(tx).findById(org, closed) };
    });
    expect(outcome.deleted).toBe(false);
    expect(outcome.stillUsable?.id).toBe(closed);
  });
});

describe('migrated rows: attachments', () => {
  it('stores attachments with their batch and reads them back only in their organization and application', async () => {
    const { org, batchId, rows, job } = await world();
    const jobId = await job('closed');
    const candidate = await createDrizzleCandidates(handle.db).create(buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` }));
    const applications = createDrizzleApplications(handle.db);
    const application = await applications.create(buildApplication({ id: randomUUID(), organizationId: org, jobId, candidateId: candidate.id, migrationBatchId: batchId, cv: null, answers: [{ question: 'Q', answer: 'A' }] }));
    expect(application.answers).toEqual([{ question: 'Q', answer: 'A' }]);
    const at = new Date('2025-02-01T09:00:00Z');
    const attachment = (id: string, kind: 'cover_letter' | 'other') => ({
      id, organizationId: org, applicationId: application.id, migrationBatchId: batchId, kind, fileName: `${id}.pdf`, mediaType: 'application/pdf' as const, sizeBytes: 3, key: attachmentKey(org, application.id, id), createdAt: at,
    });
    const [first, second] = [attachment(randomUUID(), 'cover_letter'), attachment(randomUUID(), 'other')];
    await rows.insertAttachments(batchId, [first, second]);
    await rows.insertAttachments(batchId, []);
    expect((await applications.listAttachments(org, [application.id])).map((f) => f.id).toSorted()).toEqual([first.id, second.id].toSorted());
    expect(await applications.listAttachments(org, [])).toEqual([]);
    expect(await applications.listAttachments(randomUUID(), [application.id])).toEqual([]);
    expect(await applications.findAttachment(org, application.id, first.id)).toEqual(first);
    expect(await applications.findAttachment(randomUUID(), application.id, first.id)).toBeNull();
    expect(await applications.findAttachment(org, randomUUID(), first.id)).toBeNull();
    const row = { ...first, storageKey: first.key, mediaType: 'text/html' as never };
    expect(() => toAttachment(row)).toThrow('Unexpected attachment media type');
  });
});
