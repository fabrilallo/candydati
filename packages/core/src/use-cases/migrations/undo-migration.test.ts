import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../errors.js';
import { buildApplication, ORG_A, seedMigrationCommitWorld, type TestMigrationCommitDeps } from '../../testing/index.js';
import { deliverQueued } from '../../testing/import-fixtures.js';
import { confirmedMigration, DECLARATIONS, readyMigration } from '../../testing/migration-commit-fixtures.js';
import { migrationOwner, migrationRecruiter } from '../../testing/migration-fixtures.js';
import { answerConsentRequest } from '../imports/consent-request.js';
import { commitMigration } from './commit-migration.js';
import { requestMigrationCommit } from './request-commit.js';
import { undoMigration } from './undo-migration.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

/** The rows a migration can touch, as comparable values. */
function rows(deps: TestMigrationCommitDeps) {
  const { store, messagingStore, importStore } = deps;
  return {
    jobs: deps.jobs.snapshot(),
    candidates: store.read().candidates,
    applications: store.read().applications,
    attachments: store.read().attachments,
    notes: store.read().notes,
    stageEvents: store.read().stageEvents,
    extractions: store.read().extractions,
    messages: messagingStore.read().messages,
    conversations: messagingStore.read().conversations,
    tokens: importStore.read().tokens,
    files: deps.files.keys().filter((key) => key.includes('/applications/')),
  };
}

/** A ready batch, the rows as they were, then the commit as the worker runs it. */
async function committedWithBaseline() {
  const deps = seedMigrationCommitWorld();
  const ready = await readyMigration(deps);
  const before = rows(deps);
  await requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS });
  expect(await commitMigration(deps, { organizationId: ORG_A, batchId: ready.id })).toBe('done');
  return { deps, batchId: ready.id, before };
}

const migratedOf = (deps: TestMigrationCommitDeps, batchId: string) => deps.store.read().applications.filter((a) => a.migrationBatchId === batchId);

describe('undoMigration', () => {
  it('leaves the database as it was before the commit, keeps the batch row undone with its counts, and audits it', async () => {
    const { deps, batchId, before } = await committedWithBaseline();
    const result = await undoMigration(deps, migrationOwner, { migrationId: batchId });
    expect(rows(deps)).toEqual(before);
    expect(result.counts).toEqual({ applicationsErased: 4, candidatesErased: 2, keptReconfirmed: 0, keptAppliedAgain: 0, jobsDeleted: 2, jobsKept: 0, historyDeleted: 1, failed: 0 });
    expect(await deps.migrations.findById(ORG_A, batchId)).toMatchObject({ status: 'undone', undoneAt: deps.now(), counts: { undo: result.counts, commit: { applications: 4 } } });
    const erased = deps.auditLog.events().filter((e) => e.action === 'candidate.erased');
    expect(erased).toHaveLength(3);
    expect(erased.every((e) => e.metadata.reason === 'migration_undone')).toBe(true);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'migration.undone', actor: { type: 'user', id: 'user_owner' }, target: { type: 'migration_batch', id: batchId }, metadata: { ...result.counts, status: 'undone' } });
  });

  it('keeps people who reconfirmed (all their migrated applications) and who applied again, counted, with the jobs they hold', async () => {
    const { deps, batchId } = await committedWithBaseline();
    const secrets = await deliverQueued(deps);
    const carlaApps = migratedOf(deps, batchId).filter((a) => a.consentStatus === 'to_renew');
    const secret = carlaApps.map((a) => secrets.get(a.id)).find((value) => value !== undefined);
    expect(await answerConsentRequest(deps, { token: secret, scopes: ['selection'] })).toEqual({ status: 'reconfirmed' });
    expect(migratedOf(deps, batchId).filter((a) => a.candidateId === carlaApps[0]?.candidateId).map((a) => a.consentStatus)).toEqual(['given', 'given']);
    const dario = deps.store.read().candidates.find((c) => c.firstName === 'Dario');
    if (dario === undefined) throw new Error('expected the candidate Dario');
    deps.store.write({ applications: [...deps.store.read().applications, buildApplication({ id: 'app_again', organizationId: ORG_A, candidateId: dario.id, createdAt: new Date('2026-06-02T00:00:00Z') })] });
    const result = await undoMigration(deps, migrationOwner, { migrationId: batchId });
    expect(result.counts).toMatchObject({ keptReconfirmed: 1, keptAppliedAgain: 1, applicationsErased: 1, candidatesErased: 0, jobsDeleted: 0, jobsKept: 2 });
    const left = migratedOf(deps, batchId);
    expect(left.map((a) => a.candidateId).toSorted()).toEqual([carlaApps[0]?.candidateId, carlaApps[0]?.candidateId, dario.id].toSorted());
    expect(deps.store.read().notes.map((n) => n.body).toSorted()).toEqual(['Non disponibile', 'Portfolio interessante']);
    expect(deps.store.read().applications.some((a) => a.id === 'app_1')).toBe(true);
  });

  it('keeps a migrated job that holds an application from outside the batch', async () => {
    const { deps, batchId } = await committedWithBaseline();
    const designer = deps.jobs.snapshot().find((j) => j.content.title === 'Designer');
    if (designer === undefined) throw new Error('expected the migrated job Designer');
    deps.store.write({ applications: [...deps.store.read().applications, buildApplication({ id: 'app_outside', organizationId: ORG_A, jobId: designer.id, createdAt: new Date('2026-01-01T00:00:00Z') })] });
    const result = await undoMigration(deps, migrationOwner, { migrationId: batchId });
    expect(result.counts).toMatchObject({ jobsDeleted: 1, jobsKept: 1, keptAppliedAgain: 0 });
    expect(deps.jobs.snapshot().map((j) => j.content.title)).toContain('Designer');
  });

  it('stays done while an erasure fails, keeps that person whole, and finishes on the next run', async () => {
    const { deps, batchId } = await committedWithBaseline();
    let failures = 1;
    const flaky = { ...deps, erasure: { run: <T,>(work: Parameters<typeof deps.erasure.run<T>>[0]) => (failures-- > 0 ? Promise.reject(new Error('db down')) : deps.erasure.run(work)) } };
    const first = await undoMigration(flaky, migrationOwner, { migrationId: batchId });
    expect(first.counts.failed).toBe(1);
    expect(first.batch.status).toBe('done');
    expect(first.counts).toMatchObject({ jobsDeleted: 0, jobsKept: 0 });
    const second = await undoMigration(deps, migrationOwner, { migrationId: batchId });
    expect(second.batch.status).toBe('undone');
    expect(migratedOf(deps, batchId)).toEqual([]);
    expect(deps.jobs.snapshot().map((j) => j.id)).toEqual(['job_1']);
  });

  it('runs only on a done or failed batch, for owners and admins', async () => {
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps);
    expect(await rejection(undoMigration(deps, migrationOwner, { migrationId: batch.id }))).toBeInstanceOf(ConflictError);
    expect(await rejection(undoMigration(deps, migrationRecruiter, { migrationId: batch.id }))).toBeInstanceOf(ForbiddenError);
    deps.packages.register(batch.packageKey, { ok: false, code: 'invalid_archive', details: [] });
    await commitMigration(deps, { organizationId: ORG_A, batchId: batch.id });
    expect((await undoMigration(deps, migrationOwner, { migrationId: batch.id })).batch.status).toBe('undone');
    expect(await rejection(undoMigration(deps, migrationOwner, { migrationId: batch.id }))).toBeInstanceOf(ConflictError);
  });
});
