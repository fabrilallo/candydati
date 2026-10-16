import { runCvExtraction, type Actor, type CvExtractionDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const CV_EXTRACT_QUEUE = 'cv.extract';

/** Ids only: a payload never carries personal data. */
export const cvExtractPayload = z.object({ organizationId: z.string().min(1), applicationId: z.string().min(1) });

const WORKER_ACTOR_ID = 'cv-extractor';

/** The use case skips the permission check for system jobs; the organization scope still applies. */
const systemActorFor = (organizationId: string): Actor => ({
  type: 'system',
  id: WORKER_ACTOR_ID,
  onBehalfOfUserId: null,
  organizationId,
  role: 'interviewer',
});

/**
 * Extraction is idempotent and never throws for a bad document. Whatever does throw (database, storage down) fails the
 * job, and pg-boss retries it with the limits chosen by the sender.
 */
export const createCvExtractQueue = (deps: CvExtractionDeps): QueueDefinition<typeof cvExtractPayload> =>
  defineQueue({
    name: CV_EXTRACT_QUEUE,
    payload: cvExtractPayload,
    handle: async ({ jobId, payload, logger }) => {
      const status = await runCvExtraction(deps, systemActorFor(payload.organizationId), payload);
      logger.info({ jobId, applicationId: payload.applicationId, status }, 'cv extraction finished');
    },
  });
