import { constantTimeEqual, missingGoogleScopes, type CalendarConnectionProvider, type CalendarConnectionState, type GoogleCalendarOutcome } from '@candydati/domain';
import { z } from 'zod';
import { toAuditActor, type Actor } from '../../actor.js';
import {
  calendarConnectionSecretContext,
  type CalendarConnectionDeps,
  type CalendarConnectionRecord,
  type GoogleCalendarAuth,
  type GoogleConnectionProblem,
  type GoogleGrant,
} from '../../calendar-connection-ports.js';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { inTransaction } from '../../transaction.js';
import { defineUseCase } from '../../use-case.js';

/**
 * "Connect Google Calendar": the person's own calendar, with OAuth. Start sends them to Google with a state and a PKCE
 * verifier the api keeps in an encrypted cookie; the callback checks both, exchanges the code server side and keeps
 * only the refresh token, sealed. Personal like the iCal link: only the person, in a session, never an API key or the
 * assistant.
 */
const PROVIDER: CalendarConnectionProvider = 'google';
/** Google's answer when the person said no on the consent screen. */
const CONSENT_REFUSED = 'access_denied';
const QUERY_MAX = 2048;

export interface CalendarConnectionView {
  readonly provider: CalendarConnectionProvider;
  readonly accountEmail: string;
  readonly status: CalendarConnectionState;
  readonly connectedAt: Date;
}

export interface CalendarConnectionStatus {
  readonly available: boolean;
  readonly connection: CalendarConnectionView | null;
}

/** What the browser keeps between start and Google's callback (encrypted cookie, 10 minutes). */
export interface PendingGoogleConnection {
  readonly state: string;
  readonly codeVerifier: string;
  readonly organizationId: string;
  readonly userId: string;
}

export const pendingGoogleConnectionSchema: z.ZodType<PendingGoogleConnection> = z
  .object({ state: z.string().min(1).max(256), codeVerifier: z.string().min(1).max(128), organizationId: z.string().min(1).max(200), userId: z.string().min(1).max(200) })
  .strict();

const callbackQuerySchema = z.object({
  code: z.string().min(1).max(QUERY_MAX).optional(),
  state: z.string().min(1).max(QUERY_MAX).optional(),
  error: z.string().min(1).max(100).regex(/^[a-z_]+$/).optional(),
});

function personOf(actor: Actor): string {
  if (actor.type !== 'user') throw new ForbiddenError('Only a person connects their own calendar.');
  return actor.id;
}

const toView = (record: CalendarConnectionRecord): CalendarConnectionView => ({
  provider: record.provider,
  accountEmail: record.accountEmail,
  status: record.status,
  connectedAt: record.createdAt,
});

export const getMyCalendarConnection = defineUseCase<CalendarConnectionDeps, z.ZodObject<Record<string, never>>, CalendarConnectionStatus>({
  name: 'getMyCalendarConnection',
  input: z.object({}),
  permission: { skip: 'a person reads only their own calendar connection, checked in the handler' },
  audit: { skip: 'read of the person’s own setting, without the token' },
  handler: async ({ deps, actor }) => {
    const record = await deps.calendarConnections.find(actor.organizationId, personOf(actor), PROVIDER);
    return { available: deps.googleCalendar !== null, connection: record ? toView(record) : null };
  },
});

const requireGoogle = (deps: CalendarConnectionDeps): GoogleCalendarAuth => {
  if (deps.googleCalendar === null) throw new NotFoundError('Google Calendar is not set up on this instance.');
  return deps.googleCalendar;
};

export const beginGoogleCalendarConnection = defineUseCase<
  CalendarConnectionDeps,
  z.ZodObject<{ redirectUri: z.ZodURL }>,
  { readonly location: string; readonly pending: PendingGoogleConnection }
>({
  name: 'beginGoogleCalendarConnection',
  input: z.object({ redirectUri: z.url() }),
  permission: { skip: 'a person connects only their own calendar, checked in the handler' },
  audit: { skip: 'nothing is stored until Google answers; the callback audits the connection' },
  handler: async ({ deps, actor, input }) => {
    const userId = personOf(actor);
    const google = requireGoogle(deps);
    // `randomToken` gives 32 random bytes in base64url: 43 characters, the RFC 7636 minimum for a PKCE verifier.
    const pending: PendingGoogleConnection = { state: deps.randomToken(), codeVerifier: deps.randomToken(), organizationId: actor.organizationId, userId };
    return { location: google.authorizationUrl({ state: pending.state, codeVerifier: pending.codeVerifier, redirectUri: input.redirectUri }), pending };
  },
});

const completeInput = z.object({ query: z.unknown(), pending: pendingGoogleConnectionSchema.nullable(), redirectUri: z.url() });

type Completed = { readonly outcome: GoogleCalendarOutcome };

const report = (deps: CalendarConnectionDeps, outcome: GoogleCalendarOutcome, problem: GoogleConnectionProblem): Completed => {
  deps.onProblem(problem);
  return { outcome };
};

/** Gives an unused grant back to Google; a failure is reported, never thrown (the person already has an answer). */
async function giveBack(deps: CalendarConnectionDeps, google: GoogleCalendarAuth, refreshToken: string): Promise<void> {
  try {
    await google.revoke(refreshToken);
  } catch (error) {
    deps.onProblem({ reason: 'revoke_failed', error });
  }
}

async function store(deps: CalendarConnectionDeps, actor: Actor, userId: string, grant: GoogleGrant): Promise<void> {
  const now = deps.now();
  const existing = await deps.calendarConnections.find(actor.organizationId, userId, PROVIDER);
  const record: CalendarConnectionRecord = {
    organizationId: actor.organizationId,
    userId,
    provider: PROVIDER,
    accountEmail: grant.accountEmail,
    refreshTokenCiphertext: deps.connectionSecrets.seal(grant.refreshToken, calendarConnectionSecretContext(PROVIDER, actor.organizationId, userId)),
    scopes: grant.scopes.split(/\s+/).filter(Boolean),
    status: 'active',
    lastError: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await inTransaction(deps, async (tx) => {
    await tx.calendarConnections.save(record);
    await tx.auditLog.append({
      organizationId: actor.organizationId,
      actor: toAuditActor(actor),
      action: 'calendar_connection.connected',
      target: { type: 'calendar_connection', id: userId },
      metadata: { provider: PROVIDER },
    });
  });
}

/** Never throws for what Google or the browser sent: the outcome is a code the settings page explains. */
export const completeGoogleCalendarConnection = defineUseCase<CalendarConnectionDeps, typeof completeInput, Completed>({
  name: 'completeGoogleCalendarConnection',
  input: completeInput,
  permission: { skip: 'a person connects only their own calendar, checked in the handler' },
  audit: { skip: 'appended with the connection, in its own transaction, after the call to Google' },
  transaction: { skip: 'the code is exchanged with Google over the network first' },
  handler: async ({ deps, actor, input }) => {
    const userId = personOf(actor);
    const google = requireGoogle(deps);
    const { pending } = input;
    if (pending === null) return { outcome: 'expired' };
    const parsed = callbackQuerySchema.safeParse(input.query);
    if (!parsed.success) return report(deps, 'failed', { reason: 'invalid_query' });
    const { code, state, error } = parsed.data;
    if (state === undefined || !constantTimeEqual(state, pending.state)) return report(deps, 'failed', { reason: 'state_mismatch' });
    if (pending.userId !== userId || pending.organizationId !== actor.organizationId) return report(deps, 'failed', { reason: 'other_person' });
    if (error !== undefined) return error === CONSENT_REFUSED ? { outcome: 'cancelled' } : report(deps, 'failed', { reason: 'google_error', detail: error });
    if (code === undefined) return report(deps, 'failed', { reason: 'invalid_query' });
    let grant: GoogleGrant;
    try {
      grant = await google.exchange({ code, codeVerifier: pending.codeVerifier, redirectUri: input.redirectUri });
    } catch (exchangeError) {
      return report(deps, 'failed', { reason: 'exchange_failed', error: exchangeError });
    }
    if (missingGoogleScopes(grant.scopes).length > 0) {
      await giveBack(deps, google, grant.refreshToken);
      return report(deps, 'missing_scope', { reason: 'missing_scope' });
    }
    await store(deps, actor, userId, grant);
    return { outcome: 'connected' };
  },
});

/** Gives the grant back to Google (best effort) and forgets the token. Events already written stay in the calendar. */
export const disconnectGoogleCalendar = defineUseCase<CalendarConnectionDeps, z.ZodObject<Record<string, never>>, { readonly removed: boolean }>({
  name: 'disconnectGoogleCalendar',
  input: z.object({}),
  permission: { skip: 'a person disconnects only their own calendar, checked in the handler' },
  audit: { skip: 'appended with the removal, in its own transaction, after the call to Google' },
  transaction: { skip: 'the grant is revoked at Google over the network first' },
  handler: async ({ deps, actor }) => {
    const userId = personOf(actor);
    const record = await deps.calendarConnections.find(actor.organizationId, userId, PROVIDER);
    if (record === null) return { removed: false };
    if (deps.googleCalendar !== null) {
      const token = deps.connectionSecrets.open(record.refreshTokenCiphertext, calendarConnectionSecretContext(PROVIDER, actor.organizationId, userId));
      await giveBack(deps, deps.googleCalendar, token);
    }
    return inTransaction(deps, async (tx) => {
      const removed = await tx.calendarConnections.remove(actor.organizationId, userId, PROVIDER);
      if (removed) {
        await tx.auditLog.append({
          organizationId: actor.organizationId,
          actor: toAuditActor(actor),
          action: 'calendar_connection.removed',
          target: { type: 'calendar_connection', id: userId },
          metadata: { provider: PROVIDER },
        });
      }
      return { removed };
    });
  },
});
