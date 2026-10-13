import { and, asc, count, eq, inArray, schema } from '@tt/db';
import type { Message } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { MessageRepository } from '../messaging-ports.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleMessages(db: DbExecutor): MessageRepository {
  const { message } = schema;
  const one = async (where: ReturnType<typeof and>): Promise<Message | null> => (await db.select().from(message).where(where).limit(1))[0] ?? null;
  return {
    async create(value) {
      try {
        const [row] = await db.insert(message).values(value).returning();
        if (!row) throw new Error('message insert returned no row');
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('This inbound message was already stored.');
        throw error;
      }
    },
    async save(value) {
      const [row] = await db
        .update(message)
        .set(value)
        .where(and(eq(message.organizationId, value.organizationId), eq(message.id, value.id)))
        .returning();
      if (!row) throw new Error('message not found');
      return row;
    },
    findById: (organizationId, id) => one(and(eq(message.organizationId, organizationId), eq(message.id, id))),
    findByInboundMessageId: (organizationId, inboundMessageId) =>
      one(and(eq(message.organizationId, organizationId), eq(message.inboundMessageId, inboundMessageId))),
    listByApplication: (organizationId, applicationId) =>
      db
        .select()
        .from(message)
        .where(and(eq(message.organizationId, organizationId), eq(message.applicationId, applicationId)))
        .orderBy(asc(message.createdAt), asc(message.id)),
    async countByApplication(organizationId, applicationIds) {
      const zero = Object.fromEntries(applicationIds.map((id) => [id, 0]));
      if (applicationIds.length === 0) return zero;
      const rows = await db
        .select({ applicationId: message.applicationId, total: count() })
        .from(message)
        .where(and(eq(message.organizationId, organizationId), inArray(message.applicationId, [...applicationIds])))
        .groupBy(message.applicationId);
      return { ...zero, ...Object.fromEntries(rows.map((r) => [r.applicationId, r.total])) };
    },
  };
}
