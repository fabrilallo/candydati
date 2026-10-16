import { createMigrationFromConnector, createMigrationFromFiles } from '@candydati/core';
import { FAKE_CREDENTIALS, FAKE_FILES_SOURCE, FAKE_SOURCE, ORG_A, fakeSourceCatalog, partCounts, seedMigrationFetchWorld, userActor } from '@candydati/core/testing';
import { migrationUploadKey } from '@candydati/domain';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createMigrationFetchQueue, MIGRATION_FETCH_QUEUE } from './migration-fetch.js';

const owner = userActor({ id: 'user_owner', organizationId: ORG_A, role: 'owner' });

/** A logger that records every line, to prove no credential is ever logged. */
const recordingLogger = () => {
  const lines: string[] = [];
  const logger = pino({ level: 'trace' }, { write: (line: string) => lines.push(line) });
  return { logger, lines };
};

describe('migration.fetch', () => {
  it('fetches, leaves the part uploaded and queued for analysis, and logs ids and the outcome only', async () => {
    const deps = seedMigrationFetchWorld();
    const queue = createMigrationFetchQueue(deps);
    expect(queue.name).toBe(MIGRATION_FETCH_QUEUE);
    const batch = await createMigrationFromConnector(deps, owner, { connectorId: FAKE_SOURCE.id, credentials: { ...FAKE_CREDENTIALS } });
    deps.fetcher.script({ kind: 'parts', parts: [partCounts(), partCounts()] });
    const { logger, lines } = recordingLogger();
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: batch.id }, logger, lastAttempt: true, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'uploaded' });
    expect(lines.join('\n')).toContain('"outcome":"fetched"');
    expect(lines.join('\n')).not.toContain(FAKE_CREDENTIALS.apiKey);
  });

  it('never throws for a retry: a failed fetch ends failed, its credentials wiped', async () => {
    const deps = seedMigrationFetchWorld();
    const queue = createMigrationFetchQueue(deps);
    const batch = await createMigrationFromConnector(deps, owner, { connectorId: FAKE_SOURCE.id, credentials: { ...FAKE_CREDENTIALS } });
    deps.fetcher.script({ kind: 'crash', error: new Error(`boom ${FAKE_CREDENTIALS.apiKey}`) });
    const { logger, lines } = recordingLogger();
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: batch.id }, logger, lastAttempt: false, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'fetch_failed' });
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
    expect(lines.join('\n')).not.toContain(FAKE_CREDENTIALS.apiKey);
  });

  it('fetches an uploaded export: no credentials, the files read through the request, deleted when it ends', async () => {
    const deps = seedMigrationFetchWorld({ fetchOverrides: { sources: fakeSourceCatalog([FAKE_FILES_SOURCE]) } });
    const queue = createMigrationFetchQueue(deps);
    for (const name of ['sheet', 'cvs'] as const) await deps.files.put(migrationUploadKey(ORG_A, 'upload_1', name), new Uint8Array([1]), 'application/octet-stream');
    const batch = await createMigrationFromFiles(deps, owner, { connectorId: 'fake-sheet', batchId: 'upload_1', sheet: { sizeBytes: 1 }, cvs: { sizeBytes: 1 } });
    const { logger, lines } = recordingLogger();
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: batch.id }, logger, lastAttempt: true, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'uploaded' });
    expect(deps.fetcher.requests()[0]?.credentials).toEqual({});
    expect(deps.files.keys().filter((key) => key.includes('/upload/'))).toEqual([]);
    expect(lines.join('\n')).toContain('"outcome":"fetched"');
  });

  it('deletes the uploaded files when the fetch fails', async () => {
    const deps = seedMigrationFetchWorld({ fetchOverrides: { sources: fakeSourceCatalog([FAKE_FILES_SOURCE]) } });
    const queue = createMigrationFetchQueue(deps);
    await deps.files.put(migrationUploadKey(ORG_A, 'upload_2', 'sheet'), new Uint8Array([1]), 'application/octet-stream');
    const batch = await createMigrationFromFiles(deps, owner, { connectorId: 'fake-sheet', batchId: 'upload_2', sheet: { sizeBytes: 1 } });
    deps.fetcher.script({ kind: 'failure', code: 'input_columns_missing' });
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: batch.id }, logger: recordingLogger().logger, lastAttempt: true, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'input_columns_missing' });
    expect(deps.files.keys().filter((key) => key.includes('/upload/'))).toEqual([]);
  });
});
