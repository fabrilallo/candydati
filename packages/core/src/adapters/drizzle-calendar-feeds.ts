import { and, eq, inArray, schema } from '@candydati/db';
import { CALENDAR_FEED_ERRORS, type BusyInterval, type CalendarFeedError } from '@candydati/domain';
import type { CalendarFeedRecord, CalendarFeedRepository } from '../calendar-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.calendarFeed.$inferSelect;
type StoredBusy = Row['busy'][number];

const toStored = (busy: readonly BusyInterval[]): readonly StoredBusy[] => busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() }));
const fromStored = (busy: readonly StoredBusy[]): readonly BusyInterval[] => busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
const errorOf = (value: string | null): CalendarFeedError | null =>
  value !== null && (CALENDAR_FEED_ERRORS as readonly string[]).includes(value) ? (value as CalendarFeedError) : null;

const toRecord = (row: Row): CalendarFeedRecord => ({ ...row, busy: fromStored(row.busy), lastError: errorOf(row.lastError) });

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleCalendarFeeds(db: DbExecutor): CalendarFeedRepository {
  const { calendarFeed } = schema;
  const person = (organizationId: string, userId: string) => and(eq(calendarFeed.organizationId, organizationId), eq(calendarFeed.userId, userId));
  return {
    async find(organizationId, userId) {
      const [row] = await db.select().from(calendarFeed).where(person(organizationId, userId)).limit(1);
      return row ? toRecord(row) : null;
    },
    async listByUsers(organizationId, userIds) {
      if (userIds.length === 0) return [];
      const rows = await db
        .select()
        .from(calendarFeed)
        .where(and(eq(calendarFeed.organizationId, organizationId), inArray(calendarFeed.userId, [...userIds])));
      return rows.map(toRecord);
    },
    async save(record) {
      const values = { ...record, busy: toStored(record.busy) };
      await db
        .insert(calendarFeed)
        .values(values)
        .onConflictDoUpdate({
          target: [calendarFeed.organizationId, calendarFeed.userId],
          set: { urlCiphertext: values.urlCiphertext, host: values.host, timeZone: values.timeZone, workingHours: values.workingHours, busy: values.busy, fetchedAt: values.fetchedAt, lastError: values.lastError, updatedAt: values.updatedAt },
        });
    },
    async updatePreferences(organizationId, userId, patch) {
      const rows = await db.update(calendarFeed).set(patch).where(person(organizationId, userId)).returning({ userId: calendarFeed.userId });
      return rows.length > 0;
    },
    async recordRefresh(organizationId, userId, refresh) {
      await db
        .update(calendarFeed)
        .set({ busy: toStored(refresh.busy), fetchedAt: refresh.fetchedAt, lastError: refresh.lastError })
        .where(person(organizationId, userId));
    },
    async remove(organizationId, userId) {
      const rows = await db.delete(calendarFeed).where(person(organizationId, userId)).returning({ userId: calendarFeed.userId });
      return rows.length > 0;
    },
  };
}
