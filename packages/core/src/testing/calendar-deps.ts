import type { BusyInterval } from '@candydati/domain';
import type { CalendarDeps, CalendarFeedRecord, CalendarFeedRepository, CalendarReadResult, CalendarReader } from '../calendar-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

const key = (organizationId: string, userId: string) => `${organizationId}:${userId}`;

export function createInMemoryCalendarFeeds(): CalendarFeedRepository & { all(): readonly CalendarFeedRecord[] } {
  const rows = cell<ReadonlyMap<string, CalendarFeedRecord>>(new Map());
  const put = (record: CalendarFeedRecord) => rows.set(new Map([...rows.get(), [key(record.organizationId, record.userId), record]]));
  return {
    all: () => [...rows.get().values()],
    find: async (organizationId, userId) => rows.get().get(key(organizationId, userId)) ?? null,
    listByUsers: async (organizationId, userIds) => userIds.flatMap((userId) => rows.get().get(key(organizationId, userId)) ?? []),
    save: async (record) => put(record),
    async updatePreferences(organizationId, userId, patch) {
      const found = rows.get().get(key(organizationId, userId));
      if (!found) return false;
      put({ ...found, ...patch });
      return true;
    },
    async recordRefresh(organizationId, userId, refresh) {
      const found = rows.get().get(key(organizationId, userId));
      if (found) put({ ...found, ...refresh });
    },
    async remove(organizationId, userId) {
      const next = new Map(rows.get());
      const removed = next.delete(key(organizationId, userId));
      rows.set(next);
      return removed;
    },
  };
}

/** Answers by URL; a URL it does not know is unreachable. Records every read. */
export interface FakeCalendarReader extends CalendarReader {
  serve(url: string, result: CalendarReadResult): void;
  reads(): readonly string[];
}

export function createFakeCalendarReader(): FakeCalendarReader {
  const served = new Map<string, CalendarReadResult>();
  const seen: string[] = [];
  return {
    serve: (url, result) => void served.set(url, result),
    reads: () => [...seen],
    async readBusy(url) {
      seen.push(url);
      return served.get(url) ?? { ok: false, error: 'unreachable' };
    },
  };
}

/** A reversible fake seal that never stores the plaintext as is. */
export const fakeSecretBox = {
  seal: (plaintext: string, context: string) => `sealed:${context}:${Buffer.from(plaintext).toString('base64')}`,
  open: (envelope: string, context: string) => {
    const prefix = `sealed:${context}:`;
    if (!envelope.startsWith(prefix)) throw new Error('wrong context');
    return Buffer.from(envelope.slice(prefix.length), 'base64').toString('utf8');
  },
};

export type CalendarWorld = CalendarDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly calendarFeeds: ReturnType<typeof createInMemoryCalendarFeeds>;
  readonly calendarReader: FakeCalendarReader;
  setNow(at: Date): void;
};

export const busy = (start: string, end: string): BusyInterval => ({ start: new Date(start), end: new Date(end) });

export function createCalendarWorld(now = new Date('2026-11-16T07:00:00Z')): CalendarWorld {
  let current = now;
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    calendarFeeds: createInMemoryCalendarFeeds(),
    calendarReader: createFakeCalendarReader(),
    calendarSecrets: fakeSecretBox,
    now: () => current,
    setNow: (at) => void (current = at),
  };
}
