import { MIGRATION_LIMITS, migrationPackageKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { apiKeyActor, agentActor, ORG_A, seedMigrationWorld } from '../../testing/index.js';
import { migrationAdmin, migrationOwner, migrationRecruiter, zipBytes } from '../../testing/migration-fixtures.js';
import { createMigrationFromPackage } from './create-migration.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const upload = { file: { fileName: 'export.zip', bytes: zipBytes() } };

describe('createMigrationFromPackage', () => {
  it('stores the ZIP under the batch prefix, leaves the batch uploaded, queues the analysis and audits', async () => {
    const deps = seedMigrationWorld();
    const batch = await createMigrationFromPackage(deps, migrationOwner, upload);
    expect(batch).toMatchObject({ organizationId: ORG_A, status: 'uploaded', connectorMaturity: 'package', createdBy: 'user_owner', counts: {}, stageMapping: [], excludedJobs: [], declarations: null, error: null });
    expect(batch.packageKey).toBe(migrationPackageKey(ORG_A, batch.id));
    expect(deps.files.keys()).toEqual([batch.packageKey]);
    expect(deps.queue.jobs()).toEqual([{ name: 'migration.analyze', payload: { organizationId: ORG_A, batchId: batch.id } }]);
    expect(deps.auditLog.events().map((e) => [e.action, e.target, e.metadata])).toEqual([['migration.created', { type: 'migration_batch', id: batch.id }, { sizeBytes: 8 }]]);
  });

  it('is for owner and admin only, never a recruiter, an API key or the agent', async () => {
    const deps = seedMigrationWorld();
    expect((await createMigrationFromPackage(deps, migrationAdmin, upload)).status).toBe('uploaded');
    for (const actor of [migrationRecruiter, apiKeyActor({ organizationId: ORG_A }), agentActor({ organizationId: ORG_A })]) {
      expect(await rejection(createMigrationFromPackage(deps, actor, upload))).toBeInstanceOf(ForbiddenError);
    }
  });

  it('refuses an empty file, something that is not a ZIP and a package over the size limit', async () => {
    const deps = seedMigrationWorld();
    const refused = async (bytes: Uint8Array) => ((await rejection(createMigrationFromPackage(deps, migrationOwner, { file: { fileName: 'x.zip', bytes } }))) as ValidationError).issues;
    expect(await refused(new Uint8Array(0))).toEqual([{ path: 'file', message: 'file_empty' }]);
    expect(await refused(new TextEncoder().encode('{"format":"candydati-migration"}'))).toEqual([{ path: 'file', message: 'not_a_zip' }]);
    const huge = zipBytes();
    Object.defineProperty(huge, 'byteLength', { value: MIGRATION_LIMITS.totalBytes + 1 });
    expect(await refused(huge)).toEqual([{ path: 'file', message: 'package_too_large' }]);
    expect(deps.migrationStore.read().batches).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('takes a package the api already streamed to storage, only under its own key, and removes it on a refusal', async () => {
    const deps = seedMigrationWorld();
    const key = migrationPackageKey(ORG_A, 'mig_streamed');
    await deps.files.put(key, zipBytes(), 'application/zip');
    const batch = await createMigrationFromPackage(deps, migrationOwner, { batchId: 'mig_streamed', file: { key, sizeBytes: 8 } });
    expect(batch).toMatchObject({ id: 'mig_streamed', packageKey: key });
    const other = migrationPackageKey(ORG_A, 'mig_other');
    await deps.files.put(other, zipBytes(), 'application/zip');
    expect(await rejection(createMigrationFromPackage(deps, migrationOwner, { batchId: 'mig_x', file: { key: other, sizeBytes: 8 } }))).toBeInstanceOf(ValidationError);
    expect(await rejection(createMigrationFromPackage(deps, migrationOwner, { file: { key, sizeBytes: 8 } }))).toBeInstanceOf(ValidationError);
    const tooBig = migrationPackageKey(ORG_A, 'mig_big');
    await deps.files.put(tooBig, zipBytes(), 'application/zip');
    expect(await rejection(createMigrationFromPackage(deps, migrationOwner, { batchId: 'mig_big', file: { key: tooBig, sizeBytes: MIGRATION_LIMITS.totalBytes + 1 } }))).toBeInstanceOf(ValidationError);
    expect(deps.files.keys()).toEqual([key, other]);
    expect(await rejection(createMigrationFromPackage(deps, migrationOwner, { batchId: 'mig_streamed', file: { fileName: 'x.zip', bytes: new Uint8Array(0) } }))).toBeInstanceOf(ConflictError);
    expect(await deps.files.get(key)).toEqual(zipBytes());
  });

  it('refuses a batch id that could escape its storage prefix', async () => {
    const deps = seedMigrationWorld();
    expect(await rejection(createMigrationFromPackage(deps, migrationOwner, { ...upload, batchId: '../org_b' }))).toBeInstanceOf(ValidationError);
  });

  it('marks the batch failed when the analysis cannot be queued, and removes the file when the batch cannot be written', async () => {
    const down = seedMigrationWorld({ migrationOverrides: { queue: { async enqueue() { throw new Error('down'); }, jobs: () => [] } } });
    expect(await createMigrationFromPackage(down, migrationOwner, upload)).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
    const broken = seedMigrationWorld();
    const failing = { ...broken, migrations: { ...broken.migrations, create: async () => Promise.reject(new Error('db down')) } };
    expect(((await rejection(createMigrationFromPackage(failing, migrationOwner, upload))) as Error).message).toBe('db down');
    expect(broken.files.keys()).toEqual([]);
  });
});
