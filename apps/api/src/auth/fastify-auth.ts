import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '@candydati/domain';
import type { Auth } from './create-auth.js';
import { createInMemoryThrottleStore, createSignInThrottle, type SignInThrottle } from './sign-in-throttle.js';
import { runWithRequestHeaders } from './request-context.js';

export const AUTH_PREFIX = '/api/auth';
export const SIGN_IN_PATH = `${AUTH_PREFIX}/sign-in/email`;

/** Cheap, read-only session lookups that every server-rendered page makes: they get their own, larger budget. */
const SESSION_READ_PATHS: ReadonlySet<string> = new Set([`${AUTH_PREFIX}/get-session`, `${AUTH_PREFIX}/organization/list`, `${AUTH_PREFIX}/organization/get-full-organization`]);
/** Routes that send an email to whatever address they are given: the smallest budget, so they cannot be used to spam. */
const EMAIL_SENDING_PATHS: ReadonlySet<string> = new Set([
  `${AUTH_PREFIX}/sign-up/email`,
  `${AUTH_PREFIX}/request-password-reset`,
  `${AUTH_PREFIX}/send-verification-email`,
]);

const pathOf = (request: Pick<FastifyRequest, 'url'>): string => request.url.split('?')[0] ?? '';
export const isSessionRead = (request: Pick<FastifyRequest, 'method' | 'url'>): boolean =>
  request.method === 'GET' && SESSION_READ_PATHS.has(pathOf(request));
export const isEmailSending = (request: Pick<FastifyRequest, 'method' | 'url'>): boolean =>
  request.method === 'POST' && EMAIL_SENDING_PATHS.has(pathOf(request));

const toWebRequest = (request: FastifyRequest): Request => {
  const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined;
  return new Request(url, {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
  });
};

async function forward(response: Response, reply: FastifyReply): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  return reply.send(response.body ? await response.text() : null);
}

/** The address of a password sign-in attempt, or null for any other request. */
const signInEmailOf = (request: FastifyRequest): string | null => {
  if (request.method !== 'POST' || pathOf(request) !== SIGN_IN_PATH) return null;
  const email = (request.body as { email?: unknown } | null | undefined)?.email;
  return typeof email === 'string' && email.trim() !== '' ? email : null;
};

export interface AuthRouteOptions {
  /** Requests per minute per client on /api/auth/*. */
  readonly authMax: number;
  /** Requests per minute per client on the session reads. */
  readonly readMax: number;
  /** Requests per minute per client on the routes that send an email (sign-up, reset, verification). */
  readonly emailMax: number;
  /** Failed sign-ins: progressive delays per (email, address). In memory unless a shared store is given. */
  readonly throttle?: SignInThrottle | undefined;
  /** Called once per cooldown when an account collects many failed sign-ins: tell its owner. */
  readonly onRepeatedFailures?: ((email: string, failures: number, request: Request) => void) | undefined;
}

/** A wrong password or unknown user is a 401 from Better Auth; anything else (400, 403, 5xx) is not a guess. */
async function recordOutcome(options: AuthRouteOptions & { throttle: SignInThrottle }, email: string, ip: string, response: Response, request: Request): Promise<void> {
  if (response.status === 401) {
    const outcome = await options.throttle.recordFailure(email, ip);
    if (outcome.notify) options.onRepeatedFailures?.(email, outcome.failures, request);
  } else if (response.status >= 200 && response.status < 300) {
    await options.throttle.recordSuccess(email, ip);
  }
}

const budgetOf = (request: FastifyRequest, options: AuthRouteOptions): { max: number; key: string } => {
  if (isSessionRead(request)) return { max: options.readMax, key: `session-read:${request.ip}` };
  if (isEmailSending(request)) return { max: options.emailMax, key: `auth-email:${request.ip}` };
  return { max: options.authMax, key: request.ip };
};

/**
 * Mounts Better Auth under /api/auth/*, with per-client budgets (sign-in and sign-up much smaller than the rest of
 * the api, the email-sending routes smaller still) and the sign-in throttle: repeated failures for one account slow
 * down further attempts (from that address, and softly from everywhere) instead of locking the account.
 */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth, options: AuthRouteOptions): void {
  const settings = { ...options, throttle: options.throttle ?? createSignInThrottle(createInMemoryThrottleStore()) };
  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_PREFIX}/*`,
    config: {
      rateLimit: {
        max: (request: FastifyRequest) => budgetOf(request, options).max,
        keyGenerator: (request: FastifyRequest) => budgetOf(request, options).key,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const signInEmail = signInEmailOf(request);
      const waitMs = signInEmail === null ? null : await settings.throttle.waitMs(signInEmail, request.ip);
      if (waitMs !== null) {
        return reply
          .status(429)
          .header('retry-after', String(Math.ceil(waitMs / 1000)))
          .send(fail('rate_limited', 'Too many failed sign-in attempts. Try again in a moment.'));
      }
      const webRequest = toWebRequest(request);
      const response = await runWithRequestHeaders(webRequest.headers, () => auth.handler(webRequest.clone()));
      if (signInEmail !== null) await recordOutcome(settings, signInEmail, request.ip, response, webRequest);
      return forward(response, reply);
    },
  });
}

export const sessionFromRequest = (auth: Auth, request: FastifyRequest) =>
  auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
