import { DEFAULT_WORKING_HOURS, type BusyInterval, type CalendarConnectionError, type CalendarConnectionProvider } from '@candydati/domain';
import {
  calendarConnectionSecretContext,
  type CalendarConnectionDeps,
  type CalendarConnectionRecord,
  type CalendarConnectionRepository,
  type GoogleCalendarApi,
  type GoogleCalendarAuth,
  type GoogleCallResult,
  type GoogleCodeExchange,
  type GoogleConnectionProblem,
  type GoogleEventInput,
  type GoogleGrant,
  type InterviewCalendarEventRecord,
  type InterviewCalendarEventRepository,
} from '../calendar-connection-ports.js';
import { createInMemoryCalendarFeeds, fakeSecretBox } from './calendar-deps.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

const key = (organizationId: string, userId: string, provider: CalendarConnectionProvider) => `${organizationId}:${userId}:${provider}`;

export function createInMemoryCalendarConnections(): CalendarConnectionRepository & { all(): readonly CalendarConnectionRecord[] } {
  const rows = cell<ReadonlyMap<string, CalendarConnectionRecord>>(new Map());
  const put = (record: CalendarConnectionRecord) => rows.set(new Map([...rows.get(), [key(record.organizationId, record.userId, record.provider), record]]));
  return {
    all: () => [...rows.get().values()],
    find: async (organizationId, userId, provider) => rows.get().get(key(organizationId, userId, provider)) ?? null,
    listByUsers: async (organizationId, userIds, provider) => userIds.flatMap((userId) => rows.get().get(key(organizationId, userId, provider)) ?? []),
    save: async (record) => put(record),
    async recordRefresh(organizationId, userId, provider, refresh) {
      const found = rows.get().get(key(organizationId, userId, provider));
      if (found) put({ ...found, ...refresh });
    },
    async updatePreferences(organizationId, userId, patch) {
      const mine = [...rows.get().values()].filter((row) => row.organizationId === organizationId && row.userId === userId);
      for (const row of mine) put({ ...row, ...patch });
      return mine.length > 0;
    },
    async remove(organizationId, userId, provider) {
      const next = new Map(rows.get());
      const removed = next.delete(key(organizationId, userId, provider));
      rows.set(next);
      return removed;
    },
  };
}

/** Google as the tests want it: a grant for a known code, a refusal otherwise; records exchanges and revocations. */
export interface FakeGoogleCalendarAuth extends GoogleCalendarAuth {
  grant(code: string, grant: GoogleGrant): void;
  failRevoke(): void;
  exchanges(): readonly GoogleCodeExchange[];
  revoked(): readonly string[];
}

export function createFakeGoogleCalendarAuth(): FakeGoogleCalendarAuth {
  const grants = new Map<string, GoogleGrant>();
  const seen: GoogleCodeExchange[] = [];
  const revoked: string[] = [];
  let revokeFails = false;
  return {
    grant: (code, grant) => void grants.set(code, grant),
    failRevoke: () => void (revokeFails = true),
    exchanges: () => [...seen],
    revoked: () => [...revoked],
    authorizationUrl: ({ state, codeVerifier, redirectUri }) =>
      `https://accounts.google.test/auth?${new URLSearchParams({ state, challenge: Buffer.from(codeVerifier).toString('hex'), redirect_uri: redirectUri }).toString()}`,
    async exchange(request) {
      seen.push(request);
      const grant = grants.get(request.code);
      if (!grant) throw new Error('google: token_refused');
      return grant;
    },
    async revoke(refreshToken) {
      if (revokeFails) throw new Error('google: unreachable');
      revoked.push(refreshToken);
    },
  };
}

export function createInMemoryInterviewCalendarEvents(): InterviewCalendarEventRepository & { all(): readonly InterviewCalendarEventRecord[] } {
  const rows = cell<ReadonlyMap<string, InterviewCalendarEventRecord>>(new Map());
  return {
    all: () => [...rows.get().values()],
    find: async (organizationId, interviewId) => rows.get().get(`${organizationId}:${interviewId}`) ?? null,
    save: async (record) => rows.set(new Map([...rows.get(), [`${record.organizationId}:${record.interviewId}`, record]])),
    async remove(organizationId, interviewId) {
      const next = new Map(rows.get());
      next.delete(`${organizationId}:${interviewId}`);
      rows.set(next);
    },
  };
}

export interface FakeGoogleEvent extends GoogleEventInput {
  readonly id: string;
  readonly refreshToken: string;
  readonly meetUrl: string | null;
}

/**
 * Google Calendar as the tests want it, per refresh token: busy times to serve, a token that stopped working, an
 * outage. Keeps the events it holds, so a test reads what the interviewer's calendar shows.
 */
export interface FakeGoogleCalendarApi extends GoogleCalendarApi {
  serveBusy(refreshToken: string, busy: readonly BusyInterval[]): void;
  fail(refreshToken: string, error: CalendarConnectionError): void;
  heal(refreshToken: string): void;
  events(): readonly FakeGoogleEvent[];
  reads(): readonly string[];
}

export function createFakeGoogleCalendarApi(): FakeGoogleCalendarApi {
  const busy = new Map<string, readonly BusyInterval[]>();
  const failing = new Map<string, CalendarConnectionError>();
  let events: readonly FakeGoogleEvent[] = [];
  const reads: string[] = [];
  let counter = 0;
  const call = async <T>(refreshToken: string, run: () => T): Promise<GoogleCallResult<T>> => {
    const error = failing.get(refreshToken);
    return error ? { ok: false, error } : { ok: true, value: run() };
  };
  return {
    serveBusy: (refreshToken, intervals) => void busy.set(refreshToken, intervals),
    fail: (refreshToken, error) => void failing.set(refreshToken, error),
    heal: (refreshToken) => void failing.delete(refreshToken),
    events: () => events,
    reads: () => [...reads],
    readBusy: (refreshToken) => {
      reads.push(refreshToken);
      return call(refreshToken, () => busy.get(refreshToken) ?? []);
    },
    createEvent: (refreshToken, event) =>
      call(refreshToken, () => {
        counter += 1;
        const created: FakeGoogleEvent = { ...event, id: `event-${counter}`, refreshToken, meetUrl: event.meet ? `https://meet.google.com/abc-defg-${counter}` : null };
        events = [...events, created];
        return { eventId: created.id, meetUrl: created.meetUrl };
      }),
    async moveEvent(refreshToken, eventId, time) {
      if (!events.some((event) => event.id === eventId && event.refreshToken === refreshToken)) return { ok: false, error: 'refused' };
      return call(refreshToken, () => {
        events = events.map((event) => (event.id === eventId ? { ...event, ...time } : event));
        return null;
      });
    },
    deleteEvent: (refreshToken, eventId) =>
      call(refreshToken, () => {
        events = events.filter((event) => event.id !== eventId);
        return null;
      }),
  };
}

/** A stored, active Google connection whose refresh token is `refresh-<userId>`. */
export function googleConnectionOf(organizationId: string, userId: string, overrides: Partial<CalendarConnectionRecord> = {}): CalendarConnectionRecord {
  const at = new Date('2026-05-01T00:00:00Z');
  return {
    organizationId,
    userId,
    provider: 'google',
    accountEmail: `${userId}@example.com`,
    refreshTokenCiphertext: fakeSecretBox.seal(`refresh-${userId}`, calendarConnectionSecretContext('google', organizationId, userId)),
    scopes: ['openid', 'email'],
    status: 'active',
    lastError: null,
    timeZone: 'Europe/Rome',
    workingHours: DEFAULT_WORKING_HOURS,
    busy: [],
    fetchedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export type CalendarConnectionWorld = CalendarConnectionDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly calendarConnections: ReturnType<typeof createInMemoryCalendarConnections>;
  readonly calendarFeeds: ReturnType<typeof createInMemoryCalendarFeeds>;
  readonly googleCalendar: FakeGoogleCalendarAuth | null;
  problems(): readonly GoogleConnectionProblem[];
};

export function createCalendarConnectionWorld(options: { readonly google?: boolean; readonly now?: Date } = {}): CalendarConnectionWorld {
  let counter = 0;
  const problems: GoogleConnectionProblem[] = [];
  const now = options.now ?? new Date('2026-11-16T07:00:00Z');
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    calendarConnections: createInMemoryCalendarConnections(),
    calendarFeeds: createInMemoryCalendarFeeds(),
    defaultTimeZone: 'Europe/Rome',
    googleCalendar: options.google === false ? null : createFakeGoogleCalendarAuth(),
    connectionSecrets: fakeSecretBox,
    randomToken: () => `random-${++counter}`,
    onProblem: (problem) => void problems.push(problem),
    problems: () => [...problems],
    now: () => now,
  };
}
