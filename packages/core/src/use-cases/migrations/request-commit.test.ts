import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { createInMemoryTaskQueue, ORG_A, seedMigrationCommitWorld } from '../../testing/index.js';
import { DECLARATIONS, readyMigration } from '../../testing/migration-commit-fixtures.js';
import { migrationAdmin, migrationOwner, migrationRecruiter } from '../../testing/migration-fixtures.js';
import { updateMigrationChoices } from './choices.js';
import { requestMigrationCommit } from './request-commit.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const issuesOf = (error: unknown) => (error as ValidationError).issues.map((issue) => issue.message);
const noNotice = { async findActive() { return null; }, async create<T>(n: T) { return n; }, async list() { return []; } };

describe('requestMigrationCommit', () => {
  it('stores the three declarations with who and when, moves the batch to importing and queues the commit once', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const saved = await requestMigrationCommit(deps, migrationAdmin, { migrationId: ready.id, declarations: DECLARATIONS });
    expect(saved).toMatchObject({ status: 'importing', declarations: { userId: 'user_admin', at: deps.now().toISOString(), ...DECLARATIONS } });
    expect(deps.queue.jobs()).toContainEqual({ name: 'migration.commit', payload: { organizationId: ORG_A, batchId: ready.id } });
    expect(deps.auditLog.events().map((e) => e.action)).not.toContain('migration.committed');
    expect(await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS }))).toBeInstanceOf(ConflictError);
  });

  it.each(['controller', 'previewChecked', 'processorsOwned'])('refuses when %s is not declared', async (field) => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const error = await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: { ...DECLARATIONS, [field]: false } }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((await deps.migrations.findById(ORG_A, ready.id))?.status).toBe('ready');
  });

  it('is for owners and admins only', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    expect(await rejection(requestMigrationCommit(deps, migrationRecruiter, { migrationId: ready.id, declarations: DECLARATIONS }))).toBeInstanceOf(ForbiddenError);
  });

  it('refuses while stages of included jobs are mapped to other, with their count, recomputed from the choices', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const unmapped = await updateMigrationChoices(deps, migrationOwner, { migrationId: ready.id, stageNames: [{ name: 'Applied', type: 'other' }] });
    expect(issuesOf(await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: unmapped.id, declarations: DECLARATIONS })))).toEqual(['stages_unmapped:2']);
    await updateMigrationChoices(deps, migrationOwner, { migrationId: ready.id, excludedJobs: ['j2', 'j3'] });
    expect(issuesOf(await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS })))).toEqual(['stages_unmapped:1']);
  });

  it('refuses a job with more distinct stages than a pipeline holds once merged', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const crowded = ready.stageMapping.map((entry, index) => ({ ...entry, type: 'team_interview' as const, title: `Team ${index}` }));
    const many = Array.from({ length: 10 }, (_, index) => ({ ...crowded[0]!, stageRef: `x${index}`, title: `Extra ${index}` }));
    deps.migrationStore.write({ batches: deps.migrationStore.read().batches.map((b) => (b.id === ready.id ? { ...b, stageMapping: [...crowded, ...many] } : b)) });
    expect(issuesOf(await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS })))).toEqual(['too_many_stages:j1']);
  });

  it('checks the privacy notice live: refused without one, accepted once one is published even if the analysis said otherwise', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const withoutNotice = { ...deps, privacyNotices: noNotice };
    expect(issuesOf(await rejection(requestMigrationCommit(withoutNotice, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS })))).toEqual(['privacy_notice_missing']);
    await deps.migrationIssues.replaceAll(ORG_A, ready.id, [{ id: 'i1', organizationId: ORG_A, batchId: ready.id, level: 'error', code: 'privacy_notice_missing', ref: null, detail: null }]);
    expect((await requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS })).status).toBe('importing');
  });

  it('keeps refusing errors the choices cannot fix', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    await deps.migrationIssues.replaceAll(ORG_A, ready.id, [{ id: 'i1', organizationId: ORG_A, batchId: ready.id, level: 'error', code: 'file_missing', ref: 'files/x', detail: null }]);
    expect(issuesOf(await rejection(requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS })))).toEqual(['file_missing']);
  });

  it('puts the batch back to ready, without declarations, when the commit cannot be queued', async () => {
    const deps = seedMigrationCommitWorld();
    const ready = await readyMigration(deps);
    const down = { ...deps, queue: createInMemoryTaskQueue(new Error('queue down')) };
    const error = await rejection(requestMigrationCommit(down, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS }));
    expect(error).toEqual(new ConflictError('queue_unavailable'));
    expect(await deps.migrations.findById(ORG_A, ready.id)).toMatchObject({ status: 'ready', declarations: null });
  });
});
