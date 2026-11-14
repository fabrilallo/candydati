import { calendarConnectionSecretContext, type CalendarConnectionDeps, type CalendarConnectionRecord, type ConnectionRefresh, type GoogleCalendarApi } from '../../calendar-connection-ports.js';
import { busyWindowOf } from './feed.js';

export type GoogleBusyDeps = Pick<CalendarConnectionDeps, 'calendarConnections' | 'connectionSecrets' | 'now'> & {
  /** Null when the instance has no Google app: connections are then ignored and the iCal links count. */
  readonly googleCalendarApi: GoogleCalendarApi | null;
};

/**
 * Busy times of the people given from their connected Google Calendar (freeBusy), read again when older than
 * `maxAgeMs`. A failed read keeps the last busy times; a grant Google no longer honours breaks the connection, and that
 * person is left out (their iCal link, if any, counts again). Only working connections are returned.
 */
export async function refreshGoogleCalendars(deps: GoogleBusyDeps, organizationId: string, userIds: readonly string[], maxAgeMs: number): Promise<readonly CalendarConnectionRecord[]> {
  const api = deps.googleCalendarApi;
  if (api === null || userIds.length === 0) return [];
  const connections = (await deps.calendarConnections.listByUsers(organizationId, userIds, 'google')).filter((record) => record.status === 'active');
  const now = deps.now();
  const read = await Promise.all(
    connections.map(async (record): Promise<CalendarConnectionRecord> => {
      if (record.fetchedAt !== null && now.getTime() - record.fetchedAt.getTime() < maxAgeMs) return record;
      const refresh = await readOne(api, deps, record, now);
      await deps.calendarConnections.recordRefresh(organizationId, record.userId, 'google', refresh);
      return { ...record, ...refresh };
    }),
  );
  return read.filter((record) => record.status === 'active');
}

async function readOne(api: GoogleCalendarApi, deps: GoogleBusyDeps, record: CalendarConnectionRecord, now: Date): Promise<ConnectionRefresh> {
  let token: string;
  try {
    token = deps.connectionSecrets.open(record.refreshTokenCiphertext, calendarConnectionSecretContext('google', record.organizationId, record.userId));
  } catch {
    // A seal that no longer opens (the instance secret changed): only connecting again helps.
    return { busy: record.busy, fetchedAt: now, lastError: 'revoked', status: 'broken' };
  }
  const window = busyWindowOf(now, record.timeZone);
  const answer = await api.readBusy(token, { from: window.from, to: window.to });
  if (answer.ok) return { busy: answer.value, fetchedAt: now, lastError: null, status: 'active' };
  return { busy: record.busy, fetchedAt: now, lastError: answer.error, status: answer.error === 'revoked' ? 'broken' : 'active' };
}
