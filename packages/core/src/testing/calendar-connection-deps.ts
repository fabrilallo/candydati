import type { CalendarConnectionProvider } from '@candydati/domain';
import type {
  CalendarConnectionDeps,
  CalendarConnectionRecord,
  CalendarConnectionRepository,
  GoogleCalendarAuth,
  GoogleCodeExchange,
  GoogleConnectionProblem,
  GoogleGrant,
} from '../calendar-connection-ports.js';
import { fakeSecretBox } from './calendar-deps.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

const key = (organizationId: string, userId: string, provider: CalendarConnectionProvider) => `${organizationId}:${userId}:${provider}`;

export function createInMemoryCalendarConnections(): CalendarConnectionRepository & { all(): readonly CalendarConnectionRecord[] } {
  const rows = cell<ReadonlyMap<string, CalendarConnectionRecord>>(new Map());
  return {
    all: () => [...rows.get().values()],
    find: async (organizationId, userId, provider) => rows.get().get(key(organizationId, userId, provider)) ?? null,
    save: async (record) => rows.set(new Map([...rows.get(), [key(record.organizationId, record.userId, record.provider), record]])),
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

export type CalendarConnectionWorld = CalendarConnectionDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly calendarConnections: ReturnType<typeof createInMemoryCalendarConnections>;
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
    googleCalendar: options.google === false ? null : createFakeGoogleCalendarAuth(),
    connectionSecrets: fakeSecretBox,
    randomToken: () => `random-${++counter}`,
    onProblem: (problem) => void problems.push(problem),
    problems: () => [...problems],
    now: () => now,
  };
}
