import type { Logger } from 'pino';
import { z } from 'zod';

export interface JobContext<Payload> {
  readonly jobId: string;
  readonly payload: Payload;
  readonly logger: Logger;
}

/**
 * A queue the worker serves. `handle` is declared with method syntax so that definitions with
 * different payload schemas can share one registry array.
 */
export interface QueueDefinition<Schema extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly payload: Schema;
  handle(job: JobContext<z.output<Schema>>): Promise<void>;
}

export const defineQueue = <Schema extends z.ZodType>(definition: QueueDefinition<Schema>): QueueDefinition<Schema> =>
  Object.freeze(definition);

export const systemHeartbeat = defineQueue({
  name: 'system.heartbeat',
  payload: z.object({ sentAt: z.iso.datetime() }),
  handle: async ({ jobId, payload, logger }) => {
    logger.info({ jobId, sentAt: payload.sentAt }, 'heartbeat received');
  },
});

/** Every queue the worker serves. Add new queues here; `startWorker` creates and registers them. */
export const QUEUE_DEFINITIONS: readonly QueueDefinition[] = Object.freeze([systemHeartbeat]);
