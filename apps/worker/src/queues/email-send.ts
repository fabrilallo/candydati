import { deliverMessage, type Actor, type DeliverDeps } from '@tt/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const EMAIL_SEND_QUEUE = 'email.send';

/** Ids only: a payload never carries personal data. */
export const emailSendPayload = z.object({ organizationId: z.string().min(1), messageId: z.string().min(1) });

const WORKER_ACTOR_ID = 'email-sender';

const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: WORKER_ACTOR_ID,
  onBehalfOfUserId: null,
  organizationId,
  role: 'interviewer',
});

/**
 * Sends one queued message. A transient provider error is rethrown while retries remain (pg-boss retries with backoff,
 * the sender of the task sets the limit); on the last attempt, or on a permanent error, the message is marked `failed`.
 */
export const createEmailSendQueue = (deps: DeliverDeps): QueueDefinition<typeof emailSendPayload> =>
  defineQueue({
    name: EMAIL_SEND_QUEUE,
    payload: emailSendPayload,
    handle: async ({ jobId, payload, logger, lastAttempt }) => {
      const result = await deliverMessage(deps, systemActorFor(payload.organizationId), { ...payload, lastAttempt });
      logger.info({ jobId, messageId: payload.messageId, result }, 'email delivery finished');
    },
  });
