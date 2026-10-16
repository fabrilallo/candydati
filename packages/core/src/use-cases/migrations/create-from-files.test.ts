import { migrationUploadKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, ORG_A } from '../../testing/index.js';
import { migrationAdmin, migrationOwner, migrationRecruiter } from '../../testing/migration-fixtures.js';
import { FAKE_FILES_SOURCE, FAKE_SOURCE, fakeSourceCatalog, seedMigrationFetchWorld } from '../../testing/migration-fetch.js';
import { createMigrationFromConnector } from './create-from-connector.js';
import { createMigrationFromFiles } from './create-from-files.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const world = () => seedMigrationFetchWorld({ fetchOverrides: { sources: fakeSourceCatalog([FAKE_SOURCE, FAKE_FILES_SOURCE]) } });
const input = { connectorId: 'fake-sheet', batchId: 'batch_1', sheet: { sizeBytes: 10 }, cvs: { sizeBytes: 20 } };
const keyOf = (name: 'sheet' | 'cvs') => migrationUploadKey(ORG_A, 'batch_1', name);

async function store(deps: ReturnType<typeof world>): Promise<void> {
  await deps.files.put(keyOf('sheet'), new Uint8Array([1]), 'text/csv');
  await deps.files.put(keyOf('cvs'), new Uint8Array([1]), 'application/zip');
}

describe('createMigrationFromFiles', () => {
  it('starts the batch fetching without credentials, records the upload, queues the fetch and audits sizes only', async () => {
    const deps = world();
    await store(deps);
    const batch = await createMigrationFromFiles(deps, migrationOwner, input);
    expect(batch).toMatchObject({ id: 'batch_1', status: 'fetching', sourceSystem: 'fake-sheet', connectorMaturity: 'beta', groupId: 'batch_1', part: 1, counts: { fetch: { done: 0, total: null, upload: { cvs: true } } } });
    expect(await deps.migrations.readCredentials(ORG_A, 'batch_1')).toBeNull();
    expect(deps.queue.jobs()).toEqual([{ name: 'migration.fetch', payload: { organizationId: ORG_A, batchId: 'batch_1' } }]);
    expect(deps.auditLog.events().map((e) => [e.action, e.metadata])).toEqual([['migration.created', { connectorId: 'fake-sheet', maturity: 'beta', sheetBytes: 10, cvsBytes: 20 }]]);
    expect(deps.files.keys()).toHaveLength(2);
  });

  it('works with the spreadsheet alone', async () => {
    const deps = world();
    const batch = await createMigrationFromFiles(deps, migrationAdmin, { connectorId: 'fake-sheet', batchId: 'solo', sheet: { sizeBytes: 5 } });
    expect(batch.counts.fetch?.upload).toEqual({ cvs: false });
  });

  it('is for owner and admin only, never a recruiter, an API key or the agent', async () => {
    const deps = world();
    for (const actor of [migrationRecruiter, apiKeyActor({ organizationId: ORG_A }), agentActor({ organizationId: ORG_A })]) {
      expect(await rejection(createMigrationFromFiles(deps, actor, input))).toBeInstanceOf(ForbiddenError);
    }
    expect(deps.migrationStore.read().batches).toEqual([]);
  });

  it.each([
    ['an unknown connector', { ...input, connectorId: 'nope' }, { path: 'connectorId', message: 'connector_unknown' }],
    ['a connector that needs credentials', { ...input, connectorId: 'fake-ats' }, { path: 'connectorId', message: 'connector_needs_credentials' }],
    ['an empty spreadsheet', { ...input, sheet: { sizeBytes: 0 } }, { path: 'sheet', message: 'file_empty' }],
    ['a spreadsheet over the cap', { ...input, sheet: { sizeBytes: 26 * 1024 * 1024 } }, { path: 'sheet', message: 'sheet_too_large' }],
    ['an empty ZIP', { ...input, cvs: { sizeBytes: 0 } }, { path: 'cvs', message: 'file_empty' }],
    ['a ZIP over the cap', { ...input, cvs: { sizeBytes: 2 * 1024 ** 3 } }, { path: 'cvs', message: 'package_too_large' }],
  ])('refuses %s and deletes what was stored', async (_name, bad, issue) => {
    const deps = world();
    await store(deps);
    const error = (await rejection(createMigrationFromFiles(deps, migrationOwner, bad))) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.issues).toEqual([issue]);
    expect(deps.files.keys()).toEqual([]);
    expect(deps.migrationStore.read().batches).toEqual([]);
  });

  it('refuses an id already taken without touching that batch files', async () => {
    const deps = world();
    await store(deps);
    await createMigrationFromFiles(deps, migrationOwner, input);
    expect(await rejection(createMigrationFromFiles(deps, migrationOwner, input))).toBeInstanceOf(ConflictError);
    expect(deps.files.keys()).toHaveLength(2);
  });

  it('fails the batch and deletes the files when the fetch cannot be queued', async () => {
    const deps = seedMigrationFetchWorld({ migrationOverrides: { queue: { async enqueue() { throw new Error('down'); }, jobs: () => [] } }, fetchOverrides: { sources: fakeSourceCatalog([FAKE_FILES_SOURCE]) } });
    await deps.files.put(keyOf('sheet'), new Uint8Array([1]), 'text/csv');
    const batch = await createMigrationFromFiles(deps, migrationOwner, input);
    expect(batch).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
    expect(deps.files.keys()).toEqual([]);
  });

  it('is not how an api connector starts, and the credentials route refuses a file connector', async () => {
    const deps = world();
    const error = (await rejection(createMigrationFromConnector(deps, migrationOwner, { connectorId: 'fake-sheet', credentials: {} }))) as ValidationError;
    expect(error.issues).toEqual([{ path: 'connectorId', message: 'connector_needs_files' }]);
  });
});
