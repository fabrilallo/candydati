import { migrationUploadKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ORG_A } from '../../testing/index.js';
import { migrationOwner } from '../../testing/migration-fixtures.js';
import { FAKE_FILES_SOURCE, FAKE_SOURCE, fakeSourceCatalog, partCounts, seedMigrationFetchWorld, type TestMigrationFetchDeps } from '../../testing/migration-fetch.js';
import { createMigrationFromFiles } from './create-from-files.js';
import { fetchMigration } from './fetch-migration.js';

const key = (name: 'sheet' | 'cvs') => migrationUploadKey(ORG_A, 'b1', name);
const payload = { organizationId: ORG_A, batchId: 'b1' };

async function start(withCvs: boolean): Promise<TestMigrationFetchDeps> {
  const deps = seedMigrationFetchWorld({ fetchOverrides: { sources: fakeSourceCatalog([FAKE_SOURCE, FAKE_FILES_SOURCE]) } });
  await deps.files.put(key('sheet'), new Uint8Array([1, 2, 3]), 'text/csv');
  if (withCvs) await deps.files.put(key('cvs'), new Uint8Array([9, 9]), 'application/zip');
  await createMigrationFromFiles(deps, migrationOwner, { connectorId: 'fake-sheet', batchId: 'b1', sheet: { sizeBytes: 3 }, ...(withCvs ? { cvs: { sizeBytes: 2 } } : {}) });
  return deps;
}

describe('fetchMigration for a file-based connector', () => {
  it('hands the connector a read-only view of the uploaded files, no credentials, and deletes the files afterwards', async () => {
    const deps = await start(true);
    let seen: { credentials: unknown; sheet: number[]; cvs: number[] } | null = null;
    const reading = {
      ...deps,
      fetcher: {
        async fetch(request: Parameters<typeof deps.fetcher.fetch>[0]) {
          seen = { credentials: request.credentials, sheet: [...((await request.inputFiles?.sheet()) ?? [])], cvs: [...((await request.inputFiles?.cvs()) ?? [])] };
          return deps.fetcher.fetch(request);
        },
      },
    };
    expect(await fetchMigration(reading, payload)).toBe('fetched');
    expect(seen).toEqual({ credentials: {}, sheet: [1, 2, 3], cvs: [9, 9] });
    expect(deps.files.keys()).toEqual([expect.stringContaining('package.zip')]);
    expect(await deps.migrations.findById(ORG_A, 'b1')).toMatchObject({ status: 'uploaded', counts: { fetch: { parts: 1 } } });
  });

  it('gives no ZIP when none was uploaded', async () => {
    const deps = await start(false);
    await fetchMigration(deps, payload);
    expect(await deps.fetcher.requests()[0]?.inputFiles?.cvs()).toBeNull();
  });

  it.each([
    ['a refusal of the connector', { kind: 'failure', code: 'source_invalid_response' } as const, 'source_invalid_response'],
    ['a crash', { kind: 'crash', error: new Error('boom') } as const, 'fetch_failed'],
  ])('fails with a safe code on %s and still deletes the uploaded files', async (_name, script, code) => {
    const deps = await start(true);
    deps.fetcher.script(script);
    expect(await fetchMigration(deps, payload)).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, 'b1')).toMatchObject({ status: 'failed', error: code });
    expect(deps.files.keys()).toEqual([]);
  });

  it('deletes the files even when writing the outcome fails', async () => {
    const deps = await start(true);
    const broken = { ...deps, migrations: { ...deps.migrations, transition: async () => Promise.reject(new Error('db down')) } };
    await expect(fetchMigration(broken, payload)).rejects.toThrow('db down');
    expect(deps.files.keys()).toEqual([]);
  });

  it('deletes the files of a batch that is no longer fetching (a repeated task)', async () => {
    const deps = await start(true);
    await deps.migrations.transition(ORG_A, 'b1', 'fetching', { status: 'failed', error: 'fetch_interrupted', updatedAt: new Date() });
    expect(await fetchMigration(deps, payload)).toBe('skipped');
    expect(deps.files.keys()).toEqual([]);
    expect(deps.fetcher.requests()).toEqual([]);
  });

  it('fails a batch whose upload record is missing, and one whose connector is gone', async () => {
    const deps = await start(true);
    deps.migrationStore.write({ batches: deps.migrationStore.read().batches.map((b) => ({ ...b, counts: {} })) });
    expect(await fetchMigration(deps, payload)).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, 'b1')).toMatchObject({ error: 'fetch_interrupted' });
    expect(partCounts().jobs).toBe(1);
  });

  it('keeps what the connector reported on the batch, for the preview', async () => {
    const deps = await start(true);
    const notices = [{ code: 'columns_unrecognized' as const, count: 1, headers: ['Taglia scarpe'] }];
    const reporting = { ...deps, fetcher: { async fetch(request: Parameters<typeof deps.fetcher.fetch>[0]) { return { ...(await deps.fetcher.fetch(request)), notices }; } } };
    await fetchMigration(reporting, payload);
    expect((await deps.migrations.findById(ORG_A, 'b1'))?.counts.fetch?.notices).toEqual(notices);
  });
});
