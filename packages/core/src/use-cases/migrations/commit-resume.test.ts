import type { MigrationPackageInput } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { fakePdfBytes, ORG_A, seedMigrationCommitWorld, type TestMigrationCommitDeps } from '../../testing/index.js';
import { COMMIT_FILES, COMMIT_PACKAGE, confirmedMigration } from '../../testing/migration-commit-fixtures.js';
import { openedPackage } from '../../testing/migration-fixtures.js';
import { APPLICATION_CHUNK } from './commit-applications.js';
import { commitMigration } from './commit-migration.js';

const run = (deps: TestMigrationCommitDeps, batchId: string) => commitMigration(deps, { organizationId: ORG_A, batchId });

const PEOPLE = APPLICATION_CHUNK + 5;

/** One job, PEOPLE people with a CV each: the applications take two chunks. */
const CROWD: MigrationPackageInput = {
  ...COMMIT_PACKAGE,
  users: [],
  jobs: [{ ref: 'j1', title: 'Backend Developer', status: 'closed', createdAt: '2025-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio HR' }] }],
  candidates: Array.from({ length: PEOPLE }, (_, i) => ({ ref: `c${i}`, firstName: 'Ada', lastName: `N${i}`, email: `p${i}@example.org`, createdAt: '2025-01-12T09:00:00Z', consent: { givenAt: '2026-01-12T09:00:00Z' } })),
  applications: Array.from({ length: PEOPLE }, (_, i) => ({
    ref: `a${i}`,
    candidateRef: `c${i}`,
    jobRef: 'j1',
    stageRef: 's1',
    createdAt: '2025-02-01T09:00:00Z',
    outcome: 'not_selected' as const,
    closedAt: '2025-03-01T09:00:00Z',
    files: [{ path: `files/a${i}/cv.pdf`, kind: 'cv' as const, fileName: 'cv.pdf' }],
  })),
  notes: [],
  messages: [],
};
const CROWD_FILES = () => Object.fromEntries(Array.from({ length: PEOPLE }, (_, i) => [`files/a${i}/cv.pdf`, fakePdfBytes()]));

/** Everything the commit wrote, as comparable values: a resumed run must end exactly like a clean one. */
function snapshot(deps: TestMigrationCommitDeps) {
  const { store, messagingStore, importStore, migrationStore } = deps;
  return {
    jobs: deps.jobs.snapshot().length,
    candidates: store.read().candidates.length,
    applications: store.read().applications.map((a) => a.id).toSorted(),
    events: store.read().stageEvents.map((e) => e.id).toSorted(),
    notes: store.read().notes.map((n) => n.id).toSorted(),
    messages: messagingStore.read().messages.length,
    tokens: importStore.read().tokens.length,
    extractions: store.read().extractions.length,
    files: deps.files.keys().toSorted(),
    tags: migrationStore.read().tags.length,
  };
}

/** `fn` throws the `nth` time it is called (1-based), then behaves. */
function failingOnce<A extends unknown[], R>(fn: (...args: A) => Promise<R>, nth: number): (...args: A) => Promise<R> {
  let calls = 0;
  return async (...args: A) => {
    calls += 1;
    if (calls === nth) throw new Error('crash');
    return fn(...args);
  };
}

describe('commitMigration: resumable and idempotent', () => {
  it('after a crash in the second chunk, keeps the first, removes the CVs of the failed one, and the retry ends like a clean run', async () => {
    const clean = seedMigrationCommitWorld();
    const reference = await confirmedMigration(clean, openedPackage(CROWD, CROWD_FILES()), {});
    await run(clean, reference.id);

    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps, openedPackage(CROWD, CROWD_FILES()), {});
    const crashing = { ...deps, extractions: { ...deps.extractions, upsert: failingOnce(deps.extractions.upsert, APPLICATION_CHUNK + 2) } };
    await expect(run(crashing, batch.id)).rejects.toThrow('crash');
    const halfway = await deps.migrations.findById(ORG_A, batch.id);
    expect(halfway?.counts.commit).toMatchObject({ cursor: { step: 'applications', index: APPLICATION_CHUNK }, applications: APPLICATION_CHUNK, cvs: APPLICATION_CHUNK });
    expect(deps.files.keys().filter((key) => key.includes('/applications/'))).toHaveLength(APPLICATION_CHUNK);
    expect(await run(deps, batch.id)).toBe('done');
    expect(snapshot(deps)).toEqual(snapshot(clean));
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.commit).toEqual((await clean.migrations.findById(ORG_A, reference.id))?.counts.commit);
  });

  it('resumes after a crash in a later step without writing anything twice', async () => {
    const clean = seedMigrationCommitWorld();
    await run(clean, (await confirmedMigration(clean)).id);
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps);
    await expect(run({ ...deps, migratedRows: { ...deps.migratedRows, insertMessages: failingOnce(deps.migratedRows.insertMessages, 1) } }, batch.id)).rejects.toThrow('crash');
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.commit?.cursor).toEqual({ step: 'notes', index: 4 });
    expect(await run(deps, batch.id)).toBe('done');
    expect(snapshot(deps)).toEqual(snapshot(clean));
  });

  it('finishes a run that crashed after its last chunk, before the batch was marked done', async () => {
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps);
    const auditFails = { ...deps, auditLog: { ...deps.auditLog, append: failingOnce(deps.auditLog.append, 1) } };
    await expect(run(auditFails, batch.id)).rejects.toThrow('crash');
    expect((await deps.migrations.findById(ORG_A, batch.id))?.status).toBe('importing');
    const before = snapshot(deps);
    expect(await run(deps, batch.id)).toBe('done');
    expect(snapshot(deps)).toEqual(before);
    expect(deps.auditLog.events().filter((e) => e.action === 'migration.committed')).toHaveLength(1);
  });

  it('two runs of the same task at once write everything once', async () => {
    const clean = seedMigrationCommitWorld();
    await run(clean, (await confirmedMigration(clean, openedPackage(CROWD, CROWD_FILES()), {})).id);
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps, openedPackage(CROWD, CROWD_FILES()), {});
    const outcomes = await Promise.all([run(deps, batch.id), run(deps, batch.id)]);
    expect(outcomes.toSorted()).toEqual(['done', 'skipped']);
    expect(snapshot(deps)).toEqual(snapshot(clean));
  });

  it('a second open application of the same person to the same job is left out and counted', async () => {
    const deps = seedMigrationCommitWorld();
    const twice: MigrationPackageInput = {
      ...COMMIT_PACKAGE,
      applications: [...COMMIT_PACKAGE.applications, { ref: 'a7', candidateRef: 'c3', jobRef: 'j2', stageRef: 's1', createdAt: '2026-01-25T09:00:00Z' }],
    };
    const batch = await confirmedMigration(deps, openedPackage(twice, COMMIT_FILES()));
    expect(await run(deps, batch.id)).toBe('done');
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.commit).toMatchObject({ applications: 4, skippedAlreadyApplied: 1 });
  });
});
