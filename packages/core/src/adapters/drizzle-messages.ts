import { and, asc, count, eq, gte, inArray, schema } from '@candydati/db';
import { SYSTEM_SENDER, type Message } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { MessageRepository } from '../messaging-ports.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.message.$inferSelect;

/** The batch link is storage only: a message reads the same whether a migration brought it or not. */
const toMessage = ({ migrationBatchId: _batch, ...row }: Row): Message => row;

/** Outbound messages the caps count: historical ones (migrated from another ATS) were never sent from here. */
const liveOutbound = () => and(eq(schema.message.direction, 'outbound'), eq(schema.message.historical, false));

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleMessages(db: DbExecutor): MessageRepository {
  const { message } = schema;
  const one = async (where: ReturnType<typeof and>): Promise<Message | null> => {
    const [row] = await db.select().from(message).where(where).limit(1);
    return row ? toMessage(row) : null;
  };
  return {
    async create(value) {
      try {
        const [row] = await db.insert(message).values(value).returning();
        if (!row) throw new Error('message insert returned no row');
        return toMessage(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('This inbound message was already stored.');
        throw error;
      }
    },
    async transition(organizationId, id, from, patch) {
      const [row] = await db
        .update(message)
        .set(patch)
        .where(and(eq(message.organizationId, organizationId), eq(message.id, id), eq(message.status, from)))
        .returning();
      return row ? toMessage(row) : null;
    },
    findById: (organizationId, id) => one(and(eq(message.organizationId, organizationId), eq(message.id, id))),
    findByInboundMessageId: (organizationId, inboundMessageId) =>
      one(and(eq(message.organizationId, organizationId), eq(message.inboundMessageId, inboundMessageId))),
    async listByApplication(organizationId, applicationId) {
      const rows = await db
        .select()
        .from(message)
        .where(and(eq(message.organizationId, organizationId), eq(message.applicationId, applicationId)))
        .orderBy(asc(message.createdAt), asc(message.id));
      return rows.map(toMessage);
    },
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
    async countSystemOutboundSince(organizationId, since) {
      const [row] = await db
        .select({ total: count() })
        .from(message)
        .where(and(eq(message.organizationId, organizationId), liveOutbound(), eq(message.sentBy, SYSTEM_SENDER), gte(message.createdAt, since)));
      return row?.total ?? 0;
    },
    async countOutboundSince(organizationId, candidateId, since) {
      const [row] = await db
        .select({ total: count() })
        .from(message)
        .where(and(eq(message.organizationId, organizationId), eq(message.candidateId, candidateId), liveOutbound(), gte(message.createdAt, since)));
      return row?.total ?? 0;
    },
  };
}
