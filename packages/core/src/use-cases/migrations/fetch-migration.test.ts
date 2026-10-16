import { migrationPackageKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ORG_A } from '../../testing/index.js';
import { migrationOwner } from '../../testing/migration-fixtures.js';
import { FAKE_CREDENTIALS, FAKE_SOURCE, partCounts, seedMigrationFetchWorld, type TestMigrationFetchDeps } from '../../testing/migration-fetch.js';
import { createMigrationFromConnector } from './create-from-connector.js';
import { fetchMigration } from './fetch-migration.js';

const start = async (deps: TestMigrationFetchDeps) => {
  const batch = await createMigrationFromConnector(deps, migrationOwner, { connectorId: FAKE_SOURCE.id, credentials: { ...FAKE_CREDENTIALS } });
  return { batch, payload: { organizationId: ORG_A, batchId: batch.id } };
};
const analyses = (deps: TestMigrationFetchDeps) => deps.queue.jobs().filter((job) => job.name === 'migration.analyze').map((job) => job.payload);

describe('fetchMigration', () => {
  it('runs the connector with the decrypted credentials, leaves one part uploaded, wipes the credentials, audits and queues the analysis', async () => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    deps.fetcher.script({ kind: 'parts', parts: [partCounts({ jobs: 2, files: 3 })], progress: [[10, 40], [40, 40]] });
    expect(await fetchMigration(deps, payload)).toBe('fetched');
    const request = deps.fetcher.requests()[0];
    expect(request).toMatchObject({ organizationId: ORG_A, batchId: batch.id, connectorId: 'fake-ats', credentials: FAKE_CREDENTIALS, filePrefix: `organizations/${ORG_A}/migrations/${batch.id}/` });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'uploaded', groupId: batch.id, part: 1, error: null, counts: { fetch: { done: 40, total: 40, parts: 1 } } });
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
    expect(deps.files.keys()).toEqual([batch.packageKey]);
    expect(analyses(deps)).toEqual([payload]);
    const fetched = deps.auditLog.events().filter((e) => e.action === 'migration.fetched');
    expect(fetched.map((e) => [e.actor, e.target, e.metadata])).toEqual([
      [{ type: 'system', id: null, onBehalfOfUserId: null }, { type: 'migration_batch', id: batch.id }, { connectorId: 'fake-ats', parts: 1, jobs: 2, candidates: 2, applications: 3, notes: 0, messages: 0, files: 3, bytes: 100 }],
    ]);
    expect(JSON.stringify(deps.auditLog.events())).not.toContain(FAKE_CREDENTIALS.apiKey);
  });

  it('splits a large source into linked parts, one batch each, every one queued for its own analysis', async () => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    deps.fetcher.script({ kind: 'parts', parts: [partCounts(), partCounts({ jobs: 3 }), partCounts({ jobs: 4 })] });
    expect(await fetchMigration(deps, payload)).toBe('fetched');
    const group = deps.migrationStore.read().batches.filter((b) => b.groupId === batch.id).toSorted((a, b) => (a.part ?? 0) - (b.part ?? 0));
    expect(group.map((b) => [b.part, b.status, b.connectorMaturity, b.sourceSystem, b.createdBy])).toEqual([
      [1, 'uploaded', 'beta', 'fake-ats', 'user_owner'],
      [2, 'uploaded', 'beta', 'fake-ats', 'user_owner'],
      [3, 'uploaded', 'beta', 'fake-ats', 'user_owner'],
    ]);
    for (const part of group) {
      expect(part.packageKey).toBe(migrationPackageKey(ORG_A, part.id));
      expect(part.counts.fetch?.parts).toBe(3);
    }
    expect(analyses(deps)).toEqual(group.map((b) => ({ organizationId: ORG_A, batchId: b.id })));
    expect(deps.auditLog.events().find((e) => e.action === 'migration.fetched')?.metadata).toMatchObject({ parts: 3, jobs: 8 });
  });

  it.each([
    ['a refusal of the source', { kind: 'failure', code: 'credentials_refused' } as const, 'credentials_refused'],
    ['an unexpected crash', { kind: 'crash', error: new Error('socket hang up https://x?token=secret') } as const, 'fetch_failed'],
  ])('fails the batch with a safe code on %s, wipes the credentials and queues nothing', async (_name, script, code) => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    deps.fetcher.script(script);
    expect(await fetchMigration(deps, payload)).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: code });
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
    expect(analyses(deps)).toEqual([]);
  });

  it('wipes the credentials even when writing the outcome itself fails', async () => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    const broken = { ...deps, migrations: { ...deps.migrations, transition: async () => Promise.reject(new Error('db down')) } };
    await expect(fetchMigration(broken, payload)).rejects.toThrow('db down');
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
  });

  it('fails without running anything when the credentials are gone, unreadable or the connector is no longer offered', async () => {
    const gone = seedMigrationFetchWorld();
    const first = await start(gone);
    await gone.migrations.wipeCredentials(ORG_A, first.batch.id);
    expect(await fetchMigration(gone, first.payload)).toBe('failed');
    expect(await gone.migrations.findById(ORG_A, first.batch.id)).toMatchObject({ error: 'fetch_interrupted' });

    const tampered = seedMigrationFetchWorld();
    const second = await start(tampered);
    tampered.migrationStore.write({ credentials: tampered.migrationStore.read().credentials.map((c) => ({ ...c, ciphertext: 'fake1.b3RoZXI.eA' })) });
    expect(await fetchMigration(tampered, second.payload)).toBe('failed');
    expect(await tampered.migrations.findById(ORG_A, second.batch.id)).toMatchObject({ error: 'fetch_failed' });
    expect(await tampered.migrations.readCredentials(ORG_A, second.batch.id)).toBeNull();

    const removed = seedMigrationFetchWorld();
    const third = await start(removed);
    const without = { ...removed, sources: { list: () => [], find: () => undefined } };
    expect(await fetchMigration(without, third.payload)).toBe('failed');
    expect(await removed.migrations.findById(ORG_A, third.batch.id)).toMatchObject({ error: 'connector_unavailable' });
    for (const deps of [gone, tampered, removed]) expect(deps.fetcher.requests()).toEqual([]);
  });

  it('skips a batch that is not fetching (a repeated task) and still leaves no credentials', async () => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    await fetchMigration(deps, payload);
    expect(await fetchMigration(deps, payload)).toBe('skipped');
    expect(await fetchMigration(deps, { organizationId: ORG_A, batchId: 'missing' })).toBe('skipped');
    expect(deps.fetcher.requests()).toHaveLength(1);
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
  });

  it('records progress and reserved file slots on the batch, throttled', async () => {
    const deps = seedMigrationFetchWorld({ fetchOverrides: { progressIntervalMs: 60_000 } });
    const { batch, payload } = await start(deps);
    let seen: unknown[] = [];
    const fetcher = {
      ...deps.fetcher,
      async fetch(request: Parameters<typeof deps.fetcher.fetch>[0]) {
        const read = async () => (await deps.migrations.findById(ORG_A, batch.id))?.counts.fetch;
        await request.reserveFiles(1);
        await request.progress(5, null);
        await request.progress(6, 90);
        seen = [await read()];
        await request.reserveFiles(2);
        await request.reserveFiles(101);
        seen = [...seen, await read()];
        throw new Error('stop');
      },
    };
    expect(await fetchMigration({ ...deps, fetcher }, payload)).toBe('failed');
    expect(seen).toEqual([{ done: 0, total: null, reservedFiles: 100 }, { done: 6, total: 90, reservedFiles: 200 }]);
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.fetch).toEqual({ done: 6, total: 90, reservedFiles: 200 });
  });

  it('fails a part whose analysis cannot be queued, and keeps the others', async () => {
    const deps = seedMigrationFetchWorld();
    const { batch, payload } = await start(deps);
    deps.fetcher.script({ kind: 'parts', parts: [partCounts(), partCounts()] });
    const queue = { ...deps.queue, enqueue: async () => Promise.reject(new Error('down')) };
    expect(await fetchMigration({ ...deps, queue }, payload)).toBe('fetched');
    const group = deps.migrationStore.read().batches.filter((b) => b.groupId === batch.id);
    expect(group.map((b) => [b.status, b.error])).toEqual([['failed', 'queue_unavailable'], ['failed', 'queue_unavailable']]);
  });
});
