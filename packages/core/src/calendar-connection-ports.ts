import type { BusyInterval, CalendarConnectionError, CalendarConnectionProvider, CalendarConnectionState, WorkingHours } from '@candydati/domain';
import type { CalendarFeedRepository } from './calendar-ports.js';
import type { CredentialsBox } from './migration-fetch-ports.js';
import type { CoreDeps } from './ports.js';

/** Seal context of a refresh token: provider, organization and person, so a sealed token cannot be moved to another row. */
export const calendarConnectionSecretContext = (provider: CalendarConnectionProvider, organizationId: string, userId: string): string =>
  `calendar-connection:${provider}:${organizationId}:${userId}`;

/** A person's calendar connected with OAuth, as stored: the refresh token sealed, never an access token. */
export interface CalendarConnectionRecord {
  readonly organizationId: string;
  readonly userId: string;
  readonly provider: CalendarConnectionProvider;
  readonly accountEmail: string;
  readonly refreshTokenCiphertext: string;
  readonly scopes: readonly string[];
  readonly status: CalendarConnectionState;
  readonly lastError: CalendarConnectionError | null;
  readonly timeZone: string;
  readonly workingHours: WorkingHours;
  /** Busy times last read (freeBusy): only intervals, nothing about the events. */
  readonly busy: readonly BusyInterval[];
  readonly fetchedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** After a read: new busy times, or the last ones kept with the error (`revoked` also breaks the connection). */
export interface ConnectionRefresh {
  readonly busy: readonly BusyInterval[];
  readonly fetchedAt: Date;
  readonly lastError: CalendarConnectionError | null;
  readonly status: CalendarConnectionState;
}

/** Every method takes the organization: a connection belongs to one person in one organization. */
export interface CalendarConnectionRepository {
  find(organizationId: string, userId: string, provider: CalendarConnectionProvider): Promise<CalendarConnectionRecord | null>;
  listByUsers(organizationId: string, userIds: readonly string[], provider: CalendarConnectionProvider): Promise<readonly CalendarConnectionRecord[]>;
  /** Creates or replaces the person's connection. */
  save(record: CalendarConnectionRecord): Promise<void>;
  recordRefresh(organizationId: string, userId: string, provider: CalendarConnectionProvider, refresh: ConnectionRefresh): Promise<void>;
  /** Working hours and zone of every connection of the person; false when there is none. */
  updatePreferences(organizationId: string, userId: string, patch: { readonly timeZone: string; readonly workingHours: WorkingHours; readonly updatedAt: Date }): Promise<boolean>;
  /** True when there was one. */
  remove(organizationId: string, userId: string, provider: CalendarConnectionProvider): Promise<boolean>;
}

/** What a call to the calendar API gives back: never throws, never carries a token or what Google answered. */
export type GoogleCallResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CalendarConnectionError };

/** The interview as written in the interviewer's calendar: what the .ics already carries, nothing more. */
export interface GoogleEventInput {
  readonly summary: string;
  readonly description: string;
  readonly start: Date;
  readonly end: Date;
  /** Written where (in person, phone); null for video, where Google adds the Meet. */
  readonly location: string | null;
  /** Ask Google for a Meet of this event only. `requestId` makes a retry return the same Meet. */
  readonly meet: { readonly requestId: string } | null;
}

export interface GoogleEventCreated {
  readonly eventId: string;
  /** The Meet address, when one was asked and Google made it. */
  readonly meetUrl: string | null;
}

/**
 * The person's Google Calendar, reached with their refresh token (each call gets a short access token first and drops
 * it). Only the primary calendar; Google sends no email of its own (`sendUpdates=none`): the .ics invites do.
 */
export interface GoogleCalendarApi {
  readBusy(refreshToken: string, window: { readonly from: Date; readonly to: Date }): Promise<GoogleCallResult<readonly BusyInterval[]>>;
  createEvent(refreshToken: string, event: GoogleEventInput): Promise<GoogleCallResult<GoogleEventCreated>>;
  /** A new time for the same event; the Meet stays. `refused` also when the event is gone. */
  moveEvent(refreshToken: string, eventId: string, time: { readonly start: Date; readonly end: Date }): Promise<GoogleCallResult<null>>;
  /** Gone already counts as deleted. */
  deleteEvent(refreshToken: string, eventId: string): Promise<GoogleCallResult<null>>;
}

/** Which event in whose calendar belongs to an interview, to move or delete it. */
export interface InterviewCalendarEventRecord {
  readonly organizationId: string;
  readonly interviewId: string;
  readonly userId: string;
  readonly provider: CalendarConnectionProvider;
  readonly externalEventId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InterviewCalendarEventRepository {
  find(organizationId: string, interviewId: string): Promise<InterviewCalendarEventRecord | null>;
  save(record: InterviewCalendarEventRecord): Promise<void>;
  remove(organizationId: string, interviewId: string): Promise<void>;
}

export interface GoogleAuthorizationRequest {
  readonly state: string;
  /** PKCE: the adapter sends its S256 challenge; the verifier stays on the server side of the flow. */
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

export interface GoogleCodeExchange {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/** What Google grants: the refresh token (the only thing kept), the account address and the scopes the person ticked. */
export interface GoogleGrant {
  readonly refreshToken: string;
  readonly accountEmail: string;
  /** Space-separated, as Google sends it. */
  readonly scopes: string;
}

/**
 * The instance's Google app (OAuth web client). The adapter validates every answer, never logs a code or a token and
 * rejects on any doubt.
 */
export interface GoogleCalendarAuth {
  authorizationUrl(request: GoogleAuthorizationRequest): string;
  exchange(request: GoogleCodeExchange): Promise<GoogleGrant>;
  /** Tells Google to forget the grant. Rejects when Google cannot be reached or refuses. */
  revoke(refreshToken: string): Promise<void>;
}

export interface CalendarConnectionDeps extends CoreDeps {
  readonly calendarConnections: CalendarConnectionRepository;
  /** Read at connect: a person who already pasted an iCal link keeps its hours. */
  readonly calendarFeeds: Pick<CalendarFeedRepository, 'find'>;
  /** The zone of a new connection without an iCal link (the platform's). */
  readonly defaultTimeZone: string;
  /** Null when the instance has no Google app (GOOGLE_CALENDAR_CLIENT_ID / _SECRET unset): nothing can be connected. */
  readonly googleCalendar: GoogleCalendarAuth | null;
  /** Seals the refresh token at rest (`calendarConnectionSecretContext`). */
  readonly connectionSecrets: CredentialsBox;
  /** An unguessable, URL-safe random string (state and PKCE verifier). */
  readonly randomToken: () => string;
  /** Problems the person is not told in detail (codes only): a revoke that failed, an exchange Google refused. */
  readonly onProblem: (problem: GoogleConnectionProblem) => void;
  readonly now: () => Date;
}

export interface GoogleConnectionProblem {
  readonly reason: 'state_mismatch' | 'google_error' | 'invalid_query' | 'exchange_failed' | 'missing_scope' | 'revoke_failed' | 'other_person';
  /** Google's error code (a fixed vocabulary), when it sent one. */
  readonly detail?: string;
  readonly error?: unknown;
}
