import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, buildNote } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleErasureStore } from './drizzle-erasure.js';
import { createDrizzleJobs } from './drizzle-jobs.js';

let handle: DbHandle;

interface World {
  readonly org: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly batchId: string;
}

/** Rows a migration writes (Phase 3 writes them; here only their storage is exercised). */
async function insertWorld(): Promise<World> {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org });
  await createDrizzleJobs(handle.db).create(job);
  const candidate = buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` });
  await createDrizzleCandidates(handle.db).create(candidate);
  const batchId = randomUUID();
  await handle.db.insert(schema.migrationBatch).values({ id: batchId, organizationId: org, status: 'importing', sourceSystem: 'teamtailor', producer: 'test', connectorMaturity: 'beta', createdBy: 'u', packageKey: 'k' });
  return { org, jobId: job.id, candidateId: candidate.id, batchId };
}

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

describe('migrated rows in Postgres', () => {
  it('stores and reads back a migrated application without a CV, and erases it without a file key', async () => {
    const w = await insertWorld();
    const repo = createDrizzleApplications(handle.db);
    const withCv = buildApplication({ id: randomUUID(), organizationId: w.org, jobId: w.jobId, candidateId: w.candidateId, outcome: 'hired' });
    const without = buildApplication({ id: randomUUID(), organizationId: w.org, jobId: w.jobId, candidateId: w.candidateId, outcome: 'not_selected', cv: null, migrationBatchId: w.batchId });
    await repo.create(withCv);
    await repo.create(without);
    expect(await repo.findById(w.org, without.id)).toEqual(without);
    expect((await repo.findById(w.org, withCv.id))?.migrationBatchId).toBeUndefined();
    const keys = await createDrizzleErasureStore(handle.db).deleteApplications(w.org, [withCv.id, without.id]);
    expect(keys).toEqual([withCv.cv?.key]);
  });

  it('refuses an application without a CV outside a migration', async () => {
    const w = await insertWorld();
    const bad = buildApplication({ id: randomUUID(), organizationId: w.org, jobId: w.jobId, candidateId: w.candidateId, cv: null });
    await expect(createDrizzleApplications(handle.db).create(bad)).rejects.toThrow();
  });

  it('stores and lists a note by an external author', async () => {
    const w = await insertWorld();
    const repo = createDrizzleCandidateNotes(handle.db);
    const note = buildNote({ id: randomUUID(), organizationId: w.org, candidateId: w.candidateId, authorId: null, authorName: 'Giulia Rossi' });
    expect(await repo.create(note)).toEqual(note);
    expect(await repo.listByCandidate(w.org, w.candidateId)).toEqual([note]);
  });
});
