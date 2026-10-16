import { randomUUID } from 'node:crypto';
import { ANSWERS_MAX_BYTES, ATTACHMENT_MAX_BYTES } from '@candydati/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, applicationAttachment, candidate, job, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;
const violates = (constraint: string) => ({ cause: expect.objectContaining({ constraint }) });

interface World {
  readonly org: string;
  readonly applicationId: string;
}

async function insertWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(organization).values({ id: org, name: org, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db.insert(candidate).values({ id: candidateId, organizationId: org, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: NOW });
  const applicationId = randomUUID();
  await handle.db.insert(application).values({
    id: applicationId, organizationId: org, jobId, candidateId, stageId: 'received', cvKey: 'k', cvFileName: 'cv.pdf', cvMediaType: 'application/pdf', cvSizeBytes: 1,
    consent, retentionExpiresAt: NOW, source: 'import',
  });
  return { org, applicationId };
}

const attachment = (world: World, values: Partial<typeof applicationAttachment.$inferInsert> = {}) => {
  const id = values.id ?? randomUUID();
  return {
    id,
    organizationId: world.org,
    applicationId: world.applicationId,
    kind: 'cover_letter' as const,
    fileName: 'letter.pdf',
    mediaType: 'application/pdf' as const,
    sizeBytes: 10,
    storageKey: `organizations/${world.org}/applications/${world.applicationId}/attachments/${id}`,
    ...values,
  };
};

describe('application_attachment and application.answers', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url, 2);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('keeps the database caps equal to the domain ones', () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(10_485_760);
    expect(ANSWERS_MAX_BYTES).toBe(1_048_576);
  });

  it('stores an attachment under its application prefix', async () => {
    const world = await insertWorld();
    const row = attachment(world);
    await handle.db.insert(applicationAttachment).values(row);
    const [stored] = await handle.db.select().from(applicationAttachment).where(eq(applicationAttachment.id, row.id));
    expect(stored).toMatchObject({ kind: 'cover_letter', mediaType: 'application/pdf', migrationBatchId: null });
  });

  it('refuses another kind, a forbidden type, an oversize file and a key outside the application prefix', async () => {
    const world = await insertWorld();
    await expect(handle.db.insert(applicationAttachment).values(attachment(world, { kind: 'cv' as never }))).rejects.toMatchObject(violates('application_attachment_kind_check'));
    await expect(handle.db.insert(applicationAttachment).values(attachment(world, { mediaType: 'image/svg+xml' as never }))).rejects.toMatchObject(violates('application_attachment_media_type_check'));
    await expect(handle.db.insert(applicationAttachment).values(attachment(world, { sizeBytes: ATTACHMENT_MAX_BYTES + 1 }))).rejects.toMatchObject(violates('application_attachment_size_check'));
    await expect(handle.db.insert(applicationAttachment).values(attachment(world, { storageKey: `organizations/${world.org}/other` }))).rejects.toMatchObject(violates('application_attachment_key_check'));
  });

  it('keeps an application with attachments from being deleted first (RESTRICT)', async () => {
    const world = await insertWorld();
    await handle.db.insert(applicationAttachment).values(attachment(world));
    await expect(handle.db.delete(application).where(eq(application.id, world.applicationId))).rejects.toMatchObject(violates('application_attachment_application_id_application_id_fk'));
  });

  it('stores form answers as an array under the byte cap', async () => {
    const world = await insertWorld();
    const answers = [{ question: 'Notice period?', answer: 'One month' }];
    await handle.db.update(application).set({ answers }).where(eq(application.id, world.applicationId));
    const [row] = await handle.db.select({ answers: application.answers }).from(application).where(eq(application.id, world.applicationId));
    expect(row?.answers).toEqual(answers);
    await expect(handle.db.update(application).set({ answers: { question: 'q' } as never }).where(eq(application.id, world.applicationId))).rejects.toMatchObject(violates('application_answers_check'));
    const huge = [{ question: 'q', answer: 'x'.repeat(ANSWERS_MAX_BYTES) }];
    await expect(handle.db.update(application).set({ answers: huge }).where(eq(application.id, world.applicationId))).rejects.toMatchObject(violates('application_answers_check'));
  });
});
