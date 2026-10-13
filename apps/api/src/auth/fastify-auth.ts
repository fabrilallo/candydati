import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fail } from '@tt/domain';
import type { Auth } from './create-auth.js';
import { createInMemorySignInLockout, type SignInLockout } from './sign-in-lockout.js';
import { runWithRequestHeaders } from './request-context.js';

export const AUTH_PREFIX = '/api/auth';
export const SIGN_IN_PATH = `${AUTH_PREFIX}/sign-in/email`;

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
  if (request.method !== 'POST' || (request.url.split('?')[0] ?? '') !== SIGN_IN_PATH) return null;
  const email = (request.body as { email?: unknown } | null | undefined)?.email;
  return typeof email === 'string' && email.trim() !== '' ? email : null;
};

/** A wrong password or unknown user is a 401 from Better Auth; anything else (400, 403, 5xx) is not a guess. */
async function recordOutcome(lockout: SignInLockout, email: string, status: number): Promise<void> {
  if (status === 401) await lockout.recordFailure(email);
  else if (status >= 200 && status < 300) await lockout.recordSuccess(email);
}

/**
 * Mounts Better Auth under /api/auth/*. `authMax`: requests per minute per client; sign-in and sign-up get a much
 * smaller budget than the rest of the api. `lockout` refuses sign-in for an account after repeated failures, whatever
 * the client address (the address can be spoofed or rotated; the account cannot).
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  auth: Auth,
  authMax: number,
  lockout: SignInLockout = createInMemorySignInLockout(),
): void {
  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_PREFIX}/*`,
    config: { rateLimit: { max: authMax, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const signInEmail = signInEmailOf(request);
      const lockedForMs = signInEmail === null ? null : await lockout.lockedForMs(signInEmail);
      if (lockedForMs !== null) {
        return reply
          .status(429)
          .header('retry-after', String(Math.ceil(lockedForMs / 1000)))
          .send(fail('rate_limited', 'Too many failed sign-in attempts. Try again later.'));
      }
      const webRequest = toWebRequest(request);
      const response = await runWithRequestHeaders(webRequest.headers, () => auth.handler(webRequest));
      if (signInEmail !== null) await recordOutcome(lockout, signInEmail, response.status);
      return forward(response, reply);
    },
  });
}

export const sessionFromRequest = (auth: Auth, request: FastifyRequest) =>
  auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
