import type { CalendarConnectionProvider, CalendarConnectionState } from '@candydati/domain';
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
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Every method takes the organization: a connection belongs to one person in one organization. */
export interface CalendarConnectionRepository {
  find(organizationId: string, userId: string, provider: CalendarConnectionProvider): Promise<CalendarConnectionRecord | null>;
  /** Creates or replaces the person's connection. */
  save(record: CalendarConnectionRecord): Promise<void>;
  /** True when there was one. */
  remove(organizationId: string, userId: string, provider: CalendarConnectionProvider): Promise<boolean>;
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
