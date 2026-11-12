import { z } from 'zod';
import { isoDate } from '../wire/common.js';

/**
 * A person's calendar connected with OAuth (today Google): busy times read from it and, at booking, the interview event
 * written in it with its video link. Personal, optional, removable at any time; the secret iCal address keeps working
 * for every other calendar.
 */
export const CALENDAR_CONNECTION_PROVIDERS = ['google'] as const;
export type CalendarConnectionProvider = (typeof CALENDAR_CONNECTION_PROVIDERS)[number];

/** `broken`: Google no longer accepts the token (revoked, expired, password changed): the person connects again. */
export const CALENDAR_CONNECTION_STATES = ['active', 'broken'] as const;
export type CalendarConnectionState = (typeof CALENDAR_CONNECTION_STATES)[number];

export const GOOGLE_CALENDAR_ROUTE_BASE = '/api/v1/me/calendar/google';
/** The redirect URI registered in Google Cloud is the platform URL followed by this path. */
export const GOOGLE_CALENDAR_CALLBACK_PATH = `${GOOGLE_CALENDAR_ROUTE_BASE}/callback`;
/** Where the callback sends the person back, with `?google=<outcome>`. */
export const GOOGLE_CALENDAR_RETURN_PATH = '/app/settings/calendar';

/** The narrowest scopes that do the job: availability only, and the events of calendars the person owns. */
export const GOOGLE_CALENDAR_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
] as const;
/** Asked together with the calendar scopes: the address shown as "connected as". */
export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email'] as const;

/** The calendar scopes the person did not grant (Google lets them untick each one on the consent screen). */
export const missingGoogleScopes = (granted: string): readonly string[] => {
  const given = new Set(granted.split(/\s+/).filter(Boolean));
  return GOOGLE_CALENDAR_REQUIRED_SCOPES.filter((scope) => !given.has(scope));
};

/** What the settings page tells after the round trip to Google. Codes only, never an address or a token. */
export const GOOGLE_CALENDAR_OUTCOMES = ['connected', 'cancelled', 'missing_scope', 'expired', 'failed'] as const;
export type GoogleCalendarOutcome = (typeof GOOGLE_CALENDAR_OUTCOMES)[number];

export const googleCalendarOutcomeOf = (value: unknown): GoogleCalendarOutcome | null =>
  typeof value === 'string' && (GOOGLE_CALENDAR_OUTCOMES as readonly string[]).includes(value) ? (value as GoogleCalendarOutcome) : null;

export const calendarConnectionSchema = z.object({
  provider: z.enum(CALENDAR_CONNECTION_PROVIDERS),
  accountEmail: z.string(),
  status: z.enum(CALENDAR_CONNECTION_STATES),
  connectedAt: isoDate,
});
export type CalendarConnectionDto = z.infer<typeof calendarConnectionSchema>;

/** `GET /api/v1/me/calendar/google`: whether the instance offers it, and the person's connection. Never a token. */
export const calendarConnectionStatusSchema = z.object({
  /** The instance has a Google app (GOOGLE_CALENDAR_CLIENT_ID and _SECRET): otherwise the button does not show. */
  available: z.boolean(),
  connection: calendarConnectionSchema.nullable(),
});
export type CalendarConnectionStatusDto = z.infer<typeof calendarConnectionStatusSchema>;
