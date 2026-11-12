import { randomBytes } from 'node:crypto';
import type { CalendarConnectionDeps, DrizzleUnitOfWork, GoogleCalendarAuth } from '@candydati/core';
import { createGoogleCalendarAuth, createSecretBox } from '@candydati/providers';
import type { Env } from '../config/env.js';

/** One key per purpose, derived from the instance secret: a Google token never opens with another key. */
export const CALENDAR_CONNECTION_SECRET_INFO = 'candydati:calendar-connection';

export interface CalendarConnectionInputs {
  readonly env: Pick<Env, 'BETTER_AUTH_SECRET' | 'googleCalendar'>;
  readonly uow: DrizzleUnitOfWork;
  /** Test seam: Google's OAuth endpoints (the real client from GOOGLE_CALENDAR_CLIENT_ID / _SECRET by default). */
  readonly google?: GoogleCalendarAuth | null | undefined;
  readonly onProblem: CalendarConnectionDeps['onProblem'];
}

export function createCalendarConnectionDeps({ env, uow, google, onProblem }: CalendarConnectionInputs): CalendarConnectionDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    calendarConnections: r.calendarConnections,
    googleCalendar: google !== undefined ? google : env.googleCalendar ? createGoogleCalendarAuth(env.googleCalendar) : null,
    connectionSecrets: createSecretBox(env.BETTER_AUTH_SECRET, { info: CALENDAR_CONNECTION_SECRET_INFO }),
    randomToken: () => randomBytes(32).toString('base64url'),
    onProblem,
    now: () => new Date(),
  };
}
