import { randomBytes } from 'node:crypto';
import { beginLinkedInPrefill, completeLinkedInPrefill, NotFoundError, type LinkedInIdentity, type LinkedInPrefillProblem, type PendingLinkedInLogin } from '@candydati/core';
import { LINKEDIN_CALLBACK_PATH, LINKEDIN_RETURN_FRAGMENT, LINKEDIN_ROUTE_BASE, linkedInPrefillResultSchema, ok, type LinkedInPrefillResult } from '@candydati/domain';
import { createLinkedInIdentity, createSecretBox, type SecretBox } from '@candydati/providers';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { clearCookie, createSealedCookie, readCookie, serializeCookie, type SealedCookie } from '../http/sealed-cookie.js';
import { linkedInRouteConfig } from './limits.js';
import { PUBLIC_CACHE_CONTROL } from './public-jobs.js';

export const LINKEDIN_STATE_COOKIE = 'linkedin_login';
export const LINKEDIN_PREFILL_COOKIE = 'linkedin_prefill';
/** HKDF purpose of the cookie key: a key of its own, derived from the server secret. */
const COOKIE_KEY_INFO = 'candydati:linkedin-prefill-cookies';
const TTL_SECONDS = 600;
const NO_STORE = 'no-store';

export interface LinkedInRouteDeps {
  /** Null when LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set: the button does not show, start and callback are 404. */
  readonly identity: LinkedInIdentity | null;
  readonly box: SecretBox;
  readonly platformUrl: string;
  readonly routeConfig: object;
  /** Why a callback did not fill the form (codes, never personal data). */
  readonly onProblem: (problem: LinkedInPrefillProblem) => void;
  readonly now?: () => Date;
}

const pendingSchema: z.ZodType<PendingLinkedInLogin> = z.object({ state: z.string().max(512), nonce: z.string().max(128), returnPath: z.string().max(200) }).strict();

const randomToken = (): string => randomBytes(32).toString('base64url');

interface Jars {
  readonly pending: SealedCookie<PendingLinkedInLogin>;
  readonly prefill: SealedCookie<LinkedInPrefillResult>;
  readonly set: (name: string, value: string) => string;
  readonly clear: (name: string) => string;
}

function jarsOf(deps: LinkedInRouteDeps): Jars {
  const attributes = { path: LINKEDIN_ROUTE_BASE, secure: deps.platformUrl.startsWith('https://') };
  const common = { box: deps.box, ttlMs: TTL_SECONDS * 1000, now: deps.now };
  return {
    pending: createSealedCookie({ ...common, name: LINKEDIN_STATE_COOKIE, schema: pendingSchema }),
    prefill: createSealedCookie({ ...common, name: LINKEDIN_PREFILL_COOKIE, schema: linkedInPrefillResultSchema }),
    set: (name, value) => serializeCookie(name, value, { ...attributes, maxAgeSeconds: TTL_SECONDS }),
    clear: (name) => clearCookie(name, attributes),
  };
}

const requireIdentity = (deps: LinkedInRouteDeps): LinkedInIdentity => {
  if (deps.identity === null) throw new NotFoundError();
  return deps.identity;
};

const redirect = (reply: FastifyReply, location: string, cookies: readonly string[]): FastifyReply =>
  reply.header('cache-control', NO_STORE).header('referrer-policy', 'no-referrer').header('set-cookie', cookies).redirect(location, 302);

/**
 * "Fill in with LinkedIn" on the public application form (no account, no session, nothing stored). Start sends the
 * candidate to LinkedIn with a state bound to an encrypted cookie; the callback checks it, exchanges the code server side
 * and leaves first name, last name and verified email in a second encrypted cookie; the form takes them once with a
 * POST. Both cookies are HttpOnly, scoped to these routes and live 10 minutes. The URL never carries personal data.
 */
export function registerLinkedInRoutes(app: FastifyInstance, deps: LinkedInRouteDeps): void {
  const jars = jarsOf(deps);
  const config = deps.routeConfig;
  const redirectUri = `${deps.platformUrl}${LINKEDIN_CALLBACK_PATH}`;

  app.get(`${LINKEDIN_ROUTE_BASE}/status`, { config }, async (_request, reply) =>
    reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(ok({ enabled: deps.identity !== null })),
  );

  app.get(`${LINKEDIN_ROUTE_BASE}/start`, { config }, async (request, reply) => {
    const identity = requireIdentity(deps);
    const { return: returnPath } = (request.query ?? {}) as { return?: unknown };
    const started = beginLinkedInPrefill({ identity, randomToken }, { returnPath, redirectUri });
    return redirect(reply, started.location, [jars.set(LINKEDIN_STATE_COOKIE, jars.pending.seal(started.pending))]);
  });

  app.get(`${LINKEDIN_ROUTE_BASE}/callback`, { config }, async (request, reply) => {
    const identity = requireIdentity(deps);
    const pending = jars.pending.open(readCookie(request.headers.cookie, LINKEDIN_STATE_COOKIE));
    const done = await completeLinkedInPrefill({ identity }, { query: request.query, pending, redirectUri });
    if (done.problem) deps.onProblem(done.problem);
    const cleared = jars.clear(LINKEDIN_STATE_COOKIE);
    if (done.returnPath === null) return redirect(reply, '/', [cleared]);
    return redirect(reply, `${done.returnPath}#${LINKEDIN_RETURN_FRAGMENT}`, [cleared, jars.set(LINKEDIN_PREFILL_COOKIE, jars.prefill.seal(done.result))]);
  });

  // A POST, so nothing prefetches or caches it; the cookie is cleared on the first read.
  app.post(`${LINKEDIN_ROUTE_BASE}/prefill`, { config }, async (request, reply) => {
    const result = jars.prefill.open(readCookie(request.headers.cookie, LINKEDIN_PREFILL_COOKIE)) ?? { status: 'none' };
    return reply.header('cache-control', NO_STORE).header('set-cookie', jars.clear(LINKEDIN_PREFILL_COOKIE)).send(ok(result));
  });
}

/** Wires the routes from the environment: the LinkedIn app when configured, a cookie key derived from BETTER_AUTH_SECRET. */
export function registerPublicLinkedInRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { linkedIn } = ctx.env;
  registerLinkedInRoutes(app, {
    identity: linkedIn ? createLinkedInIdentity(linkedIn) : null,
    box: createSecretBox(ctx.env.BETTER_AUTH_SECRET, { info: COOKIE_KEY_INFO }),
    platformUrl: ctx.env.platform.url,
    routeConfig: linkedInRouteConfig(ctx),
    onProblem: ({ reason, detail, error }) => app.log.warn({ reason, detail, err: error }, 'linkedin prefill not completed'),
  });
}
