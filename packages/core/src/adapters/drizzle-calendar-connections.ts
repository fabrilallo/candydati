import { and, eq, inArray, schema } from '@candydati/db';
import { CALENDAR_CONNECTION_ERRORS, type BusyInterval, type CalendarConnectionError, type CalendarConnectionProvider } from '@candydati/domain';
import type { CalendarConnectionRecord, CalendarConnectionRepository, InterviewCalendarEventRepository } from '../calendar-connection-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.calendarConnection.$inferSelect;
type StoredBusy = Row['busy'][number];

const toStored = (busy: readonly BusyInterval[]): readonly StoredBusy[] => busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() }));
const fromStored = (busy: readonly StoredBusy[]): readonly BusyInterval[] => busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
const errorOf = (value: string | null): CalendarConnectionError | null =>
  value !== null && (CALENDAR_CONNECTION_ERRORS as readonly string[]).includes(value) ? (value as CalendarConnectionError) : null;
const toRecord = (row: Row): CalendarConnectionRecord => ({ ...row, busy: fromStored(row.busy), lastError: errorOf(row.lastError) });

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleCalendarConnections(db: DbExecutor): CalendarConnectionRepository {
  const { calendarConnection: table } = schema;
  const one = (organizationId: string, userId: string, provider: CalendarConnectionProvider) =>
    and(eq(table.organizationId, organizationId), eq(table.userId, userId), eq(table.provider, provider));
  return {
    async find(organizationId, userId, provider) {
      const [row] = await db.select().from(table).where(one(organizationId, userId, provider)).limit(1);
      return row ? toRecord(row) : null;
    },
    async listByUsers(organizationId, userIds, provider) {
      if (userIds.length === 0) return [];
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.organizationId, organizationId), eq(table.provider, provider), inArray(table.userId, [...userIds])));
      return rows.map(toRecord);
    },
    async save(record) {
      const values = { ...record, scopes: [...record.scopes], busy: toStored(record.busy) };
      const { organizationId: _o, userId: _u, provider: _p, createdAt: _c, ...changes } = values;
      await db.insert(table).values(values).onConflictDoUpdate({ target: [table.organizationId, table.userId, table.provider], set: changes });
    },
    async recordRefresh(organizationId, userId, provider, refresh) {
      await db
        .update(table)
        .set({ busy: toStored(refresh.busy), fetchedAt: refresh.fetchedAt, lastError: refresh.lastError, status: refresh.status, updatedAt: refresh.fetchedAt })
        .where(one(organizationId, userId, provider));
    },
    async updatePreferences(organizationId, userId, patch) {
      const rows = await db
        .update(table)
        .set(patch)
        .where(and(eq(table.organizationId, organizationId), eq(table.userId, userId)))
        .returning({ userId: table.userId });
      return rows.length > 0;
    },
    async remove(organizationId, userId, provider) {
      const rows = await db.delete(table).where(one(organizationId, userId, provider)).returning({ userId: table.userId });
      return rows.length > 0;
    },
  };
}

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleInterviewCalendarEvents(db: DbExecutor): InterviewCalendarEventRepository {
  const { interviewCalendarEvent: table } = schema;
  const one = (organizationId: string, interviewId: string) => and(eq(table.organizationId, organizationId), eq(table.interviewId, interviewId));
  return {
    async find(organizationId, interviewId) {
      const [row] = await db.select().from(table).where(one(organizationId, interviewId)).limit(1);
      return row ?? null;
    },
    async save(record) {
      const { organizationId: _o, interviewId: _i, createdAt: _c, ...changes } = record;
      await db.insert(table).values(record).onConflictDoUpdate({ target: [table.organizationId, table.interviewId], set: changes });
    },
    async remove(organizationId, interviewId) {
      await db.delete(table).where(one(organizationId, interviewId));
    },
  };
}
