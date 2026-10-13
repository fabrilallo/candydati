import { and, eq, schema } from '@tt/db';
import type { ConversationRepository } from '../messaging-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Lookups by application filter by organization; the token is global by design. */
export function createDrizzleConversations(db: DbExecutor): ConversationRepository {
  const { conversation } = schema;
  const pick = (row: typeof conversation.$inferSelect | undefined) =>
    row ? { applicationId: row.applicationId, organizationId: row.organizationId, token: row.token } : null;
  return {
    async findByApplication(organizationId, applicationId) {
      const [row] = await db
        .select()
        .from(conversation)
        .where(and(eq(conversation.organizationId, organizationId), eq(conversation.applicationId, applicationId)))
        .limit(1);
      return pick(row);
    },
    async findByToken(token) {
      const [row] = await db.select().from(conversation).where(eq(conversation.token, token)).limit(1);
      return pick(row);
    },
    async ensure(value) {
      await db.insert(conversation).values(value).onConflictDoNothing({ target: conversation.applicationId });
      const [row] = await db
        .select()
        .from(conversation)
        .where(and(eq(conversation.organizationId, value.organizationId), eq(conversation.applicationId, value.applicationId)))
        .limit(1);
      const found = pick(row);
      if (!found) throw new Error('conversation not found after insert');
      return found;
    },
  };
}
