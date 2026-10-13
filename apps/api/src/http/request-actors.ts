import type { Actor, DelegatedActor } from '@tt/core';
import type { FastifyRequest } from 'fastify';
import { bearerOf } from './bearer.js';
import { ForbiddenError, UnauthenticatedError } from './errors.js';
import type { KeyRateLimiter } from './key-rate-limit.js';

export interface RequestActorsDeps {
  /** Cookie session -> actor. */
  readonly session: (request: FastifyRequest) => Promise<Actor>;
  /** Secret -> actor, or null for anything that is not a live key. */
  readonly authenticate: (secret: string) => Promise<DelegatedActor | null>;
  readonly limiter: KeyRateLimiter;
}

export interface RequestActors {
  /** Bearer API key when the request carries one (cookies are then ignored), otherwise the session. */
  readonly resolveActor: (request: FastifyRequest) => Promise<Actor>;
  /** Session only: a request with a bearer is refused, so a key can never manage keys. */
  readonly resolveSessionActor: (request: FastifyRequest) => Promise<Actor>;
  /** Bearer key only (the MCP endpoint). */
  readonly resolveKeyActor: (request: FastifyRequest) => Promise<DelegatedActor>;
}

const tooManyRequests = (retryAfterMs: number): Error =>
  Object.assign(new Error('Too many requests.'), { statusCode: 429, retryAfterMs });

export function createRequestActors({ session, authenticate, limiter }: RequestActorsDeps): RequestActors {
  const resolveKeyActor = async (request: FastifyRequest): Promise<DelegatedActor> => {
    const secret = bearerOf(request.headers);
    if (secret === null) throw new UnauthenticatedError();
    const actor = await authenticate(secret);
    if (!actor) throw new UnauthenticatedError('Invalid API key.');
    const verdict = limiter.consume(actor.id);
    if (!verdict.allowed) throw tooManyRequests(verdict.retryAfterMs);
    return actor;
  };
  return {
    resolveKeyActor,
    resolveActor: (request) => (bearerOf(request.headers) === null ? session(request) : resolveKeyActor(request)),
    resolveSessionActor: async (request) => {
      if (bearerOf(request.headers) !== null) throw new ForbiddenError('An API key cannot manage API keys.');
      return session(request);
    },
  };
}
