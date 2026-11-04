import type { Actor, DelegatedActor } from '@candydati/core';
import { isConnectedAppAccessToken } from '@candydati/domain';
import type { FastifyRequest } from 'fastify';
import { bearerOf } from './bearer.js';
import { ForbiddenError, UnauthenticatedError } from './errors.js';
import type { KeyRateLimiter } from './key-rate-limit.js';

type Authenticator = (secret: string) => Promise<DelegatedActor | null>;

export interface RequestActorsDeps {
  /** Cookie session -> actor. */
  readonly session: (request: FastifyRequest) => Promise<Actor>;
  /** Secret -> actor, or null for anything that is not a live key. */
  readonly authenticate: Authenticator;
  /** OAuth access token of an MCP app -> actor, or null. Absent: OAuth is off and only keys reach MCP. */
  readonly authenticateConnectedApp?: Authenticator | undefined;
  readonly limiter: KeyRateLimiter;
}

export interface RequestActors {
  /** Bearer API key when the request carries one (cookies are then ignored), otherwise the session. */
  readonly resolveActor: (request: FastifyRequest) => Promise<Actor>;
  /** Session only: a request with a bearer is refused, so a key can never manage keys. */
  readonly resolveSessionActor: (request: FastifyRequest) => Promise<Actor>;
  /** Bearer key only. `cost`: units charged to the key's rate limit (one per tool call of a batch). */
  readonly resolveKeyActor: (request: FastifyRequest, cost?: number) => Promise<DelegatedActor>;
  /** The MCP endpoint: a bearer API key or an OAuth access token of a connected app, each with its own rate limit. */
  readonly resolveMcpActor: (request: FastifyRequest, cost?: number) => Promise<DelegatedActor>;
}

const tooManyRequests = (retryAfterMs: number): Error =>
  Object.assign(new Error('Too many requests.'), { statusCode: 429, retryAfterMs });

export function createRequestActors({ session, authenticate, authenticateConnectedApp, limiter }: RequestActorsDeps): RequestActors {
  /** Bearer -> actor through `pick`, then the per-credential limit (a key, or a connected app's grant). */
  const resolveBearer = async (request: FastifyRequest, cost: number, pick: (secret: string) => Authenticator | null): Promise<DelegatedActor> => {
    const secret = bearerOf(request.headers);
    if (secret === null) throw new UnauthenticatedError();
    const actor = await (pick(secret) ?? (async () => null))(secret);
    if (!actor) throw new UnauthenticatedError('Invalid or expired credentials.');
    const verdict = limiter.consume(actor.id, cost);
    if (!verdict.allowed) throw tooManyRequests(verdict.retryAfterMs);
    return actor;
  };
  const resolveKeyActor = (request: FastifyRequest, cost = 1) => resolveBearer(request, cost, () => authenticate);
  return {
    resolveKeyActor,
    // An OAuth token is never an API key: it is bound to the MCP resource (RFC 8707) and refused everywhere else.
    resolveMcpActor: (request, cost = 1) =>
      resolveBearer(request, cost, (secret) => (isConnectedAppAccessToken(secret) ? (authenticateConnectedApp ?? null) : authenticate)),
    resolveActor: (request) => (bearerOf(request.headers) === null ? session(request) : resolveKeyActor(request)),
    resolveSessionActor: async (request) => {
      if (bearerOf(request.headers) !== null) throw new ForbiddenError('An API key cannot manage API keys.');
      return session(request);
    },
  };
}
