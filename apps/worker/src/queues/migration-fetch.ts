import { fetchMigration, type MigrationFetchDeps } from '@candydati/core';
import { defineQueue, type QueueDefinition } from './definitions.js';
import { migrationPayload } from './migration-analyze.js';

export const MIGRATION_FETCH_QUEUE = 'migration.fetch';

/**
 * Runs a migration connector (ADR 0009, Phase 6): ids only in the payload, the credentials stay sealed in the batch and
 * are wiped when the fetch ends. Never retried (sent with no retry): a failure fails the batch, the operator starts
 * again. Logs ids and the outcome only, never the credentials, a URL or a vendor's message.
 */
export const createMigrationFetchQueue = (deps: MigrationFetchDeps): QueueDefinition<typeof migrationPayload> =>
  defineQueue({
    name: MIGRATION_FETCH_QUEUE,
    payload: migrationPayload,
    handle: async ({ jobId, payload, logger }) => {
      const outcome = await fetchMigration(deps, payload);
      logger.info({ jobId, batchId: payload.batchId, outcome }, 'migration fetch finished');
    },
  });
