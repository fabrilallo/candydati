import { sendSourcingNotice, type SourcingDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const SOURCING_NOTICE_QUEUE = 'sourcing.notice';

/** Ids only: never personal data. */
export const sourcingNoticePayload = z.object({ organizationId: z.string().min(1), contactId: z.string().min(1) });

/**
 * Emails the GDPR art. 14 notice to a sourced contact whose address is known (`sendSourcingNotice`). A failed send is
 * rethrown so pg-boss retries; a contact erased or already notified meanwhile gets nothing. Logs ids only.
 */
export const createSourcingNoticeQueue = (deps: SourcingDeps): QueueDefinition<typeof sourcingNoticePayload> =>
  defineQueue({
    name: SOURCING_NOTICE_QUEUE,
    payload: sourcingNoticePayload,
    handle: async ({ jobId, payload, logger }) => {
      const { sent } = await sendSourcingNotice(deps, payload);
      logger.info({ jobId, organizationId: payload.organizationId, contactId: payload.contactId, sent }, 'sourcing notice handled');
    },
  });
