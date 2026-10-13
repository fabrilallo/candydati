import type { Actor, DelegatedActor } from '@tt/core';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from './errors.js';
import { createRequestActors } from './request-actors.js';

const user: Actor = { type: 'user', id: 'u1', organizationId: 'o1', role: 'owner', onBehalfOfUserId: null };
const key: DelegatedActor = { type: 'api_key', id: 'k1', organizationId: 'o1', role: 'owner', onBehalfOfUserId: 'u1', scopes: ['job:read'] };
const request = (authorization?: string) => ({ headers: authorization === undefined ? {} : { authorization } }) as FastifyRequest;

function actors(limiter = { consume: () => ({ allowed: true, retryAfterMs: 0 }) }) {
  const session = vi.fn(async () => user);
  const authenticate = vi.fn(async (secret: string) => (secret === 'good' ? key : null));
  return { session, authenticate, ...createRequestActors({ session, authenticate, limiter }) };
}

describe('request actors', () => {
  it('uses the session without a bearer, and never touches the key store', async () => {
    const a = actors();
    await expect(a.resolveActor(request())).resolves.toBe(user);
    await expect(a.resolveActor(request('Basic x'))).resolves.toBe(user);
    expect(a.authenticate).not.toHaveBeenCalled();
  });

  it('uses the key with a bearer and never reads the session', async () => {
    const a = actors();
    await expect(a.resolveActor(request('Bearer good'))).resolves.toBe(key);
    expect(a.session).not.toHaveBeenCalled();
  });

  it('is unauthenticated for a bad or empty bearer, even when a session would have worked', async () => {
    const a = actors();
    await expect(a.resolveActor(request('Bearer bad'))).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(a.resolveActor(request('Bearer '))).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(a.session).not.toHaveBeenCalled();
  });

  it('answers 429 when the key is over its budget', async () => {
    const a = actors({ consume: () => ({ allowed: false, retryAfterMs: 5 }) });
    await expect(a.resolveActor(request('Bearer good'))).rejects.toMatchObject({ statusCode: 429 });
  });

  it('requires a key for the key-only resolver', async () => {
    const a = actors();
    await expect(a.resolveKeyActor(request())).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(a.resolveKeyActor(request('Bearer good'))).resolves.toBe(key);
  });

  it('refuses any bearer for the session-only resolver', async () => {
    const a = actors();
    await expect(a.resolveSessionActor(request('Bearer good'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.resolveSessionActor(request())).resolves.toBe(user);
  });
});
