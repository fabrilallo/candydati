import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { application, candidate, job, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;
const NOW = new Date('2026-06-01T00:00:00Z');
const consent = { privacyNoticeId: 'n', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: NOW } as never;

const seed = async () => {
  const organizationId = randomUUID();
  await handle.db.insert(organization).values({ id: organizationId, name: organizationId, slug: organizationId, createdAt: new Date() });
  const jobId = randomUUID();
  await handle.db.insert(job).values({ id: jobId, organizationId, slug: jobId, title: 'T', content: {} as never, createdBy: 'u' });
  const candidateId = randomUUID();
  await handle.db.insert(candidate).values({ id: candidateId, organizationId, firstName: 'A', lastName: 'B', email: `${candidateId}@x.it`, retentionExpiresAt: NOW });
  return { organizationId, jobId, candidateId };
};

const addApplication = async (ctx: Awaited<ReturnType<typeof seed>>, createdAt: Date, consentStatus: 'given' | 'to_renew' = 'given') => {
  const id = randomUUID();
  await handle.db.insert(application).values({
    id,
    organizationId: ctx.organizationId,
    jobId: ctx.jobId,
    candidateId: ctx.candidateId,
    stageId: 'received',
    cvKey: 'k',
    cvFileName: 'cv.pdf',
    cvMediaType: 'application/pdf',
    cvSizeBytes: 1,
    consent,
    consentStatus,
    retentionExpiresAt: NOW,
    source: 'manual',
    createdAt,
    outcome: 'hired', // decided, so several applications can share a job
  });
  return id;
};

const lastApplied = async (candidateId: string) =>
  (await handle.db.select({ at: candidate.lastAppliedAt }).from(candidate).where(eq(candidate.id, candidateId)))[0]?.at;

describe('candidate.last_applied_at trigger', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('follows consented applications through insert, consent change and delete', async () => {
    const ctx = await seed();
    expect(await lastApplied(ctx.candidateId)).toBeNull();
    const old = await addApplication(ctx, new Date('2026-01-01T00:00:00Z'));
    const recent = await addApplication(ctx, new Date('2026-03-01T00:00:00Z'));
    await addApplication(ctx, new Date('2026-05-01T00:00:00Z'), 'to_renew');
    expect(await lastApplied(ctx.candidateId)).toEqual(new Date('2026-03-01T00:00:00Z'));

    await handle.db.update(application).set({ consentStatus: 'to_renew' }).where(eq(application.id, recent));
    expect(await lastApplied(ctx.candidateId)).toEqual(new Date('2026-01-01T00:00:00Z'));

    await handle.db.delete(application).where(eq(application.id, old));
    expect(await lastApplied(ctx.candidateId)).toBeNull();
  });
});
