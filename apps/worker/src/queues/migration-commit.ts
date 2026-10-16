import { commitMigration, type MigrationCommitDeps } from '@candydati/core';
import { defineQueue, type QueueDefinition } from './definitions.js';
import { migrationPayload } from './migration-analyze.js';

export const MIGRATION_COMMIT_QUEUE = 'migration.commit';

/**
 * Writes a confirmed migration in chunks (ADR 0009, Task 3.4). Resumable: a retry continues after the last chunk that
 * committed; on the last attempt an unexpected error fails the batch so it never stays `importing`. Logs ids and the
 * outcome only.
 */
export const createMigrationCommitQueue = (deps: MigrationCommitDeps): QueueDefinition<typeof migrationPayload> =>
  defineQueue({
    name: MIGRATION_COMMIT_QUEUE,
    payload: migrationPayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      const outcome = await commitMigration(deps, { ...payload, lastAttempt });
      logger.info({ jobId, batchId: payload.batchId, outcome }, 'migration commit finished');
    },
  });
