import { createDb, type DbHandle } from '@tt/db';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { buildCandidate } from '../testing/index.js';
import { buildImportWorld, newPerson, readyBatch, recruiterOf, runCommit, type World } from '../testing/import-postgres.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { commitImport } from '../use-cases/imports/commit-import.js';
import { requestImportCommit } from '../use-cases/imports/request-commit.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleImportBatches, createDrizzleImportItems } from './drizzle-imports.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMessages } from './drizzle-messages.js';

/** Findings #6, #10, #11 and #14 of the code review: the import commit under repetition and concurrency, on Postgres. */
let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00Z');
const buildWorld = (): Promise<World> => buildImportWorld(handle, NOW);

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 6);
});
afterAll(async () => {
  await handle.close();
});

describe('import commit races on Postgres', () => {
  const settle = (promises: readonly Promise<unknown>[]) => Promise.allSettled(promises);
  const applicationsOf = async (org: string, email: string) => {
    const person = await createDrizzleCandidates(handle.db).findByEmail(org, email);
    return person ? createDrizzleApplications(handle.db).listByCandidate(org, person.id) : [];
  };

  it('starts one commit when the preview is confirmed twice at the same time (#10)', async () => {
    const world = await buildWorld();
    const batchId = await readyBatch(world, [newPerson()]);
    const results = await settle([requestImportCommit(world.deps, recruiterOf(world.org), { batchId }), requestImportCommit(world.deps, recruiterOf(world.org), { batchId })]);
    expect(results.map((r) => r.status).toSorted()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictError) });
    expect(world.queue.jobs().filter((job) => job.name === 'import.commit')).toHaveLength(1);
  });

  it('writes each person once when the commit task runs twice at the same time (#10, #11)', async () => {
    const world = await buildWorld();
    const people = [newPerson(), newPerson(), newPerson()];
    const batchId = await readyBatch(world, people);
    await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
    const runs = await settle([commitImport(world.deps, { organizationId: world.org, batchId }), commitImport(world.deps, { organizationId: world.org, batchId })]);
    expect(runs.some((r) => r.status === 'fulfilled')).toBe(true);
    // The loser of the final compare-and-set is retried by the queue: it only finishes the purge.
    await commitImport(world.deps, { organizationId: world.org, batchId });
    for (const person of people) expect(await applicationsOf(world.org, person.email)).toHaveLength(1);
    const batch = await createDrizzleImportBatches(handle.db).findById(world.org, batchId);
    expect(batch).toMatchObject({ status: 'done', counts: { imported: 3, failed: 0, emailsQueued: 3 }, sourceFiles: [] });
    const committed = await handle.pool.query(`select count(*)::int as n from audit_log where target_id = $1 and action = 'import.committed'`, [batchId]);
    expect(committed.rows[0]?.n).toBe(1);
    expect(await createDrizzleImportItems(handle.db).listAll(world.org, batchId)).toEqual([]);
  });

  it('a retry after the final status was saved only finishes the purge, and keeps the counts (#11)', async () => {
    const world = await buildWorld();
    const batchId = await readyBatch(world, [newPerson()]);
    await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
    const crashing = { ...world.deps, importItems: { ...world.deps.importItems, deleteByBatch: async () => Promise.reject(new Error('crash')) } };
    await expect(commitImport(crashing, { organizationId: world.org, batchId })).rejects.toThrow('crash');
    expect(await createDrizzleImportBatches(handle.db).findById(world.org, batchId)).toMatchObject({ status: 'done', counts: { imported: 1 } });
    const done = await commitImport(world.deps, { organizationId: world.org, batchId });
    expect(done).toMatchObject({ status: 'done', counts: { imported: 1 }, sourceFiles: [] });
    expect(await createDrizzleImportItems(handle.db).listAll(world.org, batchId)).toEqual([]);
  });

  it('sends the reconfirmation of a merged person to the existing candidate (#6)', async () => {
    const world = await buildWorld();
    const person = newPerson();
    const existing = buildCandidate({ id: randomUUID(), organizationId: world.org, email: person.email, firstName: person.first, lastName: person.last });
    await createDrizzleCandidates(handle.db).create(existing);
    const batchId = await readyBatch(world, [person]);
    await runCommit(world, batchId);
    expect(await createDrizzleImportBatches(handle.db).findById(world.org, batchId)).toMatchObject({ counts: { imported: 1, merged: 1, emailsQueued: 1 } });
    expect(await createDrizzleMessages(handle.db).countOutboundSince(world.org, existing.id, new Date(0))).toBe(1);
  });

  it('adds nothing to a job closed after the commit was requested (#14)', async () => {
    const world = await buildWorld();
    const person = newPerson();
    const batchId = await readyBatch(world, [person]);
    await requestImportCommit(world.deps, recruiterOf(world.org), { batchId });
    await createDrizzleJobs(handle.db).transition(world.org, world.jobId, 'published', { status: 'closed', closedAt: NOW, updatedAt: NOW });
    const done = await commitImport(world.deps, { organizationId: world.org, batchId });
    expect(done).toMatchObject({ status: 'failed', error: 'nothing_imported', counts: { imported: 0, failed: 1 } });
    expect(await applicationsOf(world.org, person.email)).toEqual([]);
  });
});
