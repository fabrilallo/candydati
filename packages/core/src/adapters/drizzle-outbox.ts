import { and, asc, eq, isNotNull, isNull, lt, lte, or, schema } from '@candydati/db';
import type { OutboxEvent } from '@candydati/domain';
import type { OutboxRepository, PendingOutboxEvent } from '../webhook-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. `listUnpublished` and `prune` span organizations on purpose: they are for system jobs only. */
export function createDrizzleOutbox(db: DbExecutor): OutboxRepository {
  const { outboxEvent } = schema;
  const event = {
    id: outboxEvent.id,
    organizationId: outboxEvent.organizationId,
    type: outboxEvent.type,
    data: outboxEvent.data,
    occurredAt: outboxEvent.occurredAt,
    publishedAt: outboxEvent.publishedAt,
  };
  const pending = { ...event, attempts: outboxEvent.attempts, lastError: outboxEvent.lastError, nextAttemptAt: outboxEvent.nextAttemptAt, deadAt: outboxEvent.deadAt };
  const byKey = (organizationId: string, id: string) => and(eq(outboxEvent.organizationId, organizationId), eq(outboxEvent.id, id));
  return {
    async append(row) {
      await db.insert(outboxEvent).values(row);
      return row;
    },
    async findById(organizationId, id): Promise<OutboxEvent | null> {
      const [row] = await db.select(event).from(outboxEvent).where(byKey(organizationId, id)).limit(1);
      return row ?? null;
    },
    async findWithAttempts(organizationId, id): Promise<PendingOutboxEvent | null> {
      const [row] = await db.select(pending).from(outboxEvent).where(byKey(organizationId, id)).limit(1);
      return row ?? null;
    },
    listUnpublished: (limit, now) =>
      db
        .select(pending)
        .from(outboxEvent)
        .where(and(isNull(outboxEvent.publishedAt), isNull(outboxEvent.deadAt), or(isNull(outboxEvent.nextAttemptAt), lte(outboxEvent.nextAttemptAt, now))))
        .orderBy(asc(outboxEvent.occurredAt), asc(outboxEvent.id))
        .limit(limit)
        .for('update', { skipLocked: true }),
    async markPublished(organizationId, id, at) {
      await db.update(outboxEvent).set({ publishedAt: at }).where(byKey(organizationId, id));
    },
    async recordFailure(organizationId, id, state) {
      await db.update(outboxEvent).set(state).where(byKey(organizationId, id));
    },
    async prune(before) {
      const published = and(isNotNull(outboxEvent.publishedAt), lt(outboxEvent.publishedAt, before));
      const dead = and(isNotNull(outboxEvent.deadAt), lt(outboxEvent.deadAt, before));
      const removed = await db.delete(outboxEvent).where(or(published, dead)).returning({ id: outboxEvent.id });
      return removed.length;
    },
  };
}
