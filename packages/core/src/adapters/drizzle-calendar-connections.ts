import { and, eq, schema } from '@candydati/db';
import type { CalendarConnectionProvider } from '@candydati/domain';
import type { CalendarConnectionRepository } from '../calendar-connection-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleCalendarConnections(db: DbExecutor): CalendarConnectionRepository {
  const { calendarConnection: table } = schema;
  const one = (organizationId: string, userId: string, provider: CalendarConnectionProvider) =>
    and(eq(table.organizationId, organizationId), eq(table.userId, userId), eq(table.provider, provider));
  return {
    async find(organizationId, userId, provider) {
      const [row] = await db.select().from(table).where(one(organizationId, userId, provider)).limit(1);
      return row ?? null;
    },
    async save(record) {
      const { organizationId: _o, userId: _u, provider: _p, createdAt: _c, ...changes } = record;
      await db
        .insert(table)
        .values({ ...record, scopes: [...record.scopes] })
        .onConflictDoUpdate({ target: [table.organizationId, table.userId, table.provider], set: { ...changes, scopes: [...record.scopes] } });
    },
    async remove(organizationId, userId, provider) {
      const rows = await db.delete(table).where(one(organizationId, userId, provider)).returning({ userId: table.userId });
      return rows.length > 0;
    },
  };
}
