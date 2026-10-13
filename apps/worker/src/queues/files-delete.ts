import type { FileStorage } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const FILES_DELETE_QUEUE = 'files.delete';

/** Ids and a storage key only: never personal data. */
export const filesDeletePayload = z.object({ organizationId: z.string().min(1), key: z.string().min(1) });

/**
 * Retries the deletion of a stored file whose row was already erased (PLAN §7). A failure is rethrown so pg-boss retries
 * with backoff (the sender sets the limits). A key outside the organization's own prefix is refused, never deleted:
 * the payload is data, and a task must not be a way to remove another organization's files.
 */
export const createFilesDeleteQueue = (files: FileStorage): QueueDefinition<typeof filesDeletePayload> =>
  defineQueue({
    name: FILES_DELETE_QUEUE,
    payload: filesDeletePayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      if (!payload.key.startsWith(`organizations/${payload.organizationId}/`) || payload.key.split('/').includes('..')) {
        logger.warn({ jobId, organizationId: payload.organizationId }, 'files.delete refused: key outside the organization');
        return;
      }
      try {
        await files.delete(payload.key);
      } catch (error) {
        if (lastAttempt) logger.error({ jobId, organizationId: payload.organizationId, key: payload.key, err: error }, 'file could not be deleted, giving up');
        throw error;
      }
      logger.info({ jobId, organizationId: payload.organizationId }, 'stored file deleted');
    },
  });
