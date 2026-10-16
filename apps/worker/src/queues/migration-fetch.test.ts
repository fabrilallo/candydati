import { createMigrationFromConnector } from '@candydati/core';
import { FAKE_CREDENTIALS, FAKE_SOURCE, ORG_A, partCounts, seedMigrationFetchWorld, userActor } from '@candydati/core/testing';
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
});
