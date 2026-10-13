import { and, asc, eq, isNull, schema } from '@tt/db';
import type { OutboxEvent } from '@tt/domain';
import type { OutboxRepository } from '../webhook-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. `listUnpublished` spans organizations on purpose: it is for the system publisher only. */
export function createDrizzleOutbox(db: DbExecutor): OutboxRepository {
  const { outboxEvent } = schema;
  return {
    async append(event) {
      await db.insert(outboxEvent).values(event);
      return event;
    },
    async findById(organizationId, id): Promise<OutboxEvent | null> {
      const [row] = await db
        .select()
        .from(outboxEvent)
        .where(and(eq(outboxEvent.organizationId, organizationId), eq(outboxEvent.id, id)))
        .limit(1);
      return row ?? null;
    },
    listUnpublished: (limit) =>
      db
        .select()
        .from(outboxEvent)
        .where(isNull(outboxEvent.publishedAt))
        .orderBy(asc(outboxEvent.occurredAt), asc(outboxEvent.id))
        .limit(limit)
        .for('update', { skipLocked: true }),
    async markPublished(organizationId, id, at) {
      await db
        .update(outboxEvent)
        .set({ publishedAt: at })
        .where(and(eq(outboxEvent.organizationId, organizationId), eq(outboxEvent.id, id)));
    },
  };
}
