import { commitImport, ConflictError, failImportBatch, type ImportCommitDeps } from '@tt/core';
import { importPayload } from './import-analyze.js';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const IMPORT_COMMIT_QUEUE = 'import.commit';

/**
 * Writes the included people, queues the reconfirmation emails (system messages, delivered by `email.send`) and finishes
 * the batch. Resumable: a retry continues with the items still pending. On the last attempt the batch is failed so it
 * never stays `importing`. Logs ids and counts only.
 */
export const createImportCommitQueue = (deps: ImportCommitDeps): QueueDefinition<typeof importPayload> =>
  defineQueue({
    name: IMPORT_COMMIT_QUEUE,
    payload: importPayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      try {
        const batch = await commitImport(deps, payload);
        logger.info({ jobId, batchId: batch.id, status: batch.status, counts: batch.counts }, 'import commit finished');
      } catch (error) {
        if (error instanceof ConflictError) {
          logger.warn({ jobId, batchId: payload.batchId, reason: error.message }, 'import commit skipped: batch is not importing');
          return;
        }
        if (!lastAttempt) throw error;
        await failImportBatch(deps, { ...payload, reason: 'commit_failed' }).catch(() => undefined);
        throw error;
      }
    },
  });
