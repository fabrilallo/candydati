import {
  beginGoogleCalendarConnection,
  completeGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getMyCalendarConnection,
  pendingGoogleConnectionSchema,
  type Actor,
} from '@candydati/core';
import { GOOGLE_CALENDAR_CALLBACK_PATH, GOOGLE_CALENDAR_RETURN_PATH, GOOGLE_CALENDAR_ROUTE_BASE, ok, type GoogleCalendarOutcome } from '@candydati/domain';
import { createSecretBox } from '@candydati/providers';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { clearCookie, createSealedCookie, readCookie, serializeCookie } from '../http/sealed-cookie.js';

export const GOOGLE_CALENDAR_STATE_COOKIE = 'google_calendar_login';
/** HKDF purpose of the cookie key: a key of its own, derived from the server secret. */
const COOKIE_KEY_INFO = 'candydati:google-calendar-cookie';
const TTL_SECONDS = 600;
const NO_STORE = 'no-store';

/**
 * "Connect Google Calendar" in Settings → Calendar, for the signed-in person (session only). Start sends them to
 * Google with a state and a PKCE verifier kept in an encrypted, HttpOnly cookie scoped to these routes (10 minutes);
 * the callback checks it against the session, exchanges the code server side and sends them back to the settings
 * page with `?google=<outcome>`. The URL never carries a token or an address.
 */
export function registerGoogleCalendarRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.calendarConnectionDeps;
  const redirectUri = `${ctx.env.platform.url}${GOOGLE_CALENDAR_CALLBACK_PATH}`;
  const attributes = { path: GOOGLE_CALENDAR_ROUTE_BASE, secure: ctx.env.platform.url.startsWith('https://') };
  const pending = createSealedCookie({
    box: createSecretBox(ctx.env.BETTER_AUTH_SECRET, { info: COOKIE_KEY_INFO }),
    name: GOOGLE_CALENDAR_STATE_COOKIE,
    schema: pendingGoogleConnectionSchema,
    ttlMs: TTL_SECONDS * 1000,
  });
  const redirect = (reply: FastifyReply, location: string, cookie: string): FastifyReply =>
    reply.header('cache-control', NO_STORE).header('referrer-policy', 'no-referrer').header('set-cookie', cookie).redirect(location, 302);
  const back = (reply: FastifyReply, outcome: GoogleCalendarOutcome): FastifyReply =>
    redirect(reply, `${GOOGLE_CALENDAR_RETURN_PATH}?google=${outcome}`, clearCookie(GOOGLE_CALENDAR_STATE_COOKIE, attributes));
  /** The callback is a navigation from Google: without a session it goes back to the page, which asks to sign in. */
  const sessionOrNull = async (request: FastifyRequest): Promise<Actor | null> => ctx.resolveSessionActor(request).catch(() => null);

  app.get(GOOGLE_CALENDAR_ROUTE_BASE, async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await getMyCalendarConnection(deps, await ctx.resolveSessionActor(request), {}))),
  );

  app.get(`${GOOGLE_CALENDAR_ROUTE_BASE}/start`, async (request, reply) => {
    const started = await beginGoogleCalendarConnection(deps, await ctx.resolveSessionActor(request), { redirectUri });
    return redirect(reply, started.location, serializeCookie(GOOGLE_CALENDAR_STATE_COOKIE, pending.seal(started.pending), { ...attributes, maxAgeSeconds: TTL_SECONDS }));
  });

  app.get(`${GOOGLE_CALENDAR_ROUTE_BASE}/callback`, async (request, reply) => {
    const actor = await sessionOrNull(request);
    if (actor === null) return back(reply, 'expired');
    const done = await completeGoogleCalendarConnection(deps, actor, {
      query: request.query,
      pending: pending.open(readCookie(request.headers.cookie, GOOGLE_CALENDAR_STATE_COOKIE)),
      redirectUri,
    });
    return back(reply, done.outcome);
  });

  app.delete(GOOGLE_CALENDAR_ROUTE_BASE, async (request) => ok(await disconnectGoogleCalendar(deps, await ctx.resolveSessionActor(request), {})));
}
