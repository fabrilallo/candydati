import { randomUUID } from 'node:crypto';
import type { DbExecutor } from './db-executor.js';
import { and, count, desc, eq, schema, sql } from '@tt/db';
import { auditEventSchema, newAuditEventSchema, type AuditEvent, type NewAuditEvent } from '@tt/domain';
import type { AuditLogPage, AuditLogQuery, AuditLogRepository } from '../ports.js';
import { sequential } from '../sequential.js';

type Row = typeof schema.auditLog.$inferSelect;

const toEvent = (row: Row): AuditEvent =>
  auditEventSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    actor: { type: row.actorType, id: row.actorId, onBehalfOfUserId: row.onBehalfOfUserId },
    action: row.action,
    target: { type: row.targetType, id: row.targetId },
    metadata: row.metadata,
    occurredAt: row.occurredAt,
  });

/** Postgres implementation of the append-only audit log. Every read is filtered by `organization_id`. */
export function createDrizzleAuditLog(db: DbExecutor): AuditLogRepository {
  const { auditLog } = schema;
  return {
    async append(input: NewAuditEvent): Promise<AuditEvent> {
      const event = newAuditEventSchema.parse(input);
      const [row] = await db
        .insert(auditLog)
        .values({
          id: randomUUID(),
          organizationId: event.organizationId,
          actorType: event.actor.type,
          actorId: event.actor.id,
          onBehalfOfUserId: event.actor.onBehalfOfUserId,
          action: event.action,
          targetType: event.target.type,
          targetId: event.target.id,
          metadata: event.metadata,
          // Not `now()`: inside one transaction it is the same instant for every event, and their order would be lost.
          occurredAt: sql`clock_timestamp()`,
        })
        .returning();
      if (!row) throw new Error('audit_log insert returned no row');
      return toEvent(row);
    },

    async list(query: AuditLogQuery): Promise<AuditLogPage> {
      const where = and(
        eq(auditLog.organizationId, query.organizationId),
        query.action === undefined ? undefined : eq(auditLog.action, query.action),
      );
      const [rows, totals] = await sequential(
        () =>
          db
            .select()
            .from(auditLog)
            .where(where)
            .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
            .limit(query.limit)
            .offset((query.page - 1) * query.limit),
        () => db.select({ total: count() }).from(auditLog).where(where),
      );
      return { items: rows.map(toEvent), total: totals[0]?.total ?? 0 };
    },
  };
}
