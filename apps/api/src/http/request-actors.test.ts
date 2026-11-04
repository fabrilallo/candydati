import type { Actor, DelegatedActor } from '@candydati/core';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from './errors.js';
import { createRequestActors } from './request-actors.js';

const user: Actor = { type: 'user', id: 'u1', organizationId: 'o1', role: 'owner', onBehalfOfUserId: null };
const key: DelegatedActor = { type: 'api_key', id: 'k1', organizationId: 'o1', role: 'owner', onBehalfOfUserId: 'u1', scopes: ['job:read'] };
const request = (authorization?: string) => ({ headers: authorization === undefined ? {} : { authorization } }) as FastifyRequest;

function actors(limiter: { consume: (keyId: string, cost?: number) => { allowed: boolean; retryAfterMs: number } } = { consume: () => ({ allowed: true, retryAfterMs: 0 }) }) {
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

  it('charges the given cost to the key', async () => {
    const consume = vi.fn(() => ({ allowed: true, retryAfterMs: 0 }));
    const a = actors({ consume });
    await a.resolveKeyActor(request('Bearer good'), 7);
    expect(consume).toHaveBeenCalledWith('k1', 7);
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

describe('MCP actors (API key or OAuth access token)', () => {
  const OAUTH = `candydati_oat_${'A'.repeat(32)}`;
  const app: DelegatedActor = { type: 'connected_app', id: 'g1', organizationId: 'o1', role: 'recruiter', onBehalfOfUserId: 'u1', scopes: null };

  function mcpActors(consume = vi.fn((_id: string, _cost?: number) => ({ allowed: true, retryAfterMs: 0 }))) {
    const authenticate = vi.fn(async (secret: string) => (secret === 'good' ? key : null));
    const authenticateConnectedApp = vi.fn(async (token: string) => (token === OAUTH ? app : null));
    const built = createRequestActors({ session: vi.fn(async () => user), authenticate, authenticateConnectedApp, limiter: { consume } });
    return { ...built, authenticate, authenticateConnectedApp, consume };
  }

  it('takes an OAuth access token to the connected app, never to the key store, and charges its grant', async () => {
    const a = mcpActors();
    await expect(a.resolveMcpActor(request(`Bearer ${OAUTH}`), 3)).resolves.toBe(app);
    expect(a.authenticate).not.toHaveBeenCalled();
    expect(a.consume).toHaveBeenCalledWith('g1', 3);
  });

  it('still takes an API key, unchanged', async () => {
    const a = mcpActors();
    await expect(a.resolveMcpActor(request('Bearer good'))).resolves.toBe(key);
    expect(a.authenticateConnectedApp).not.toHaveBeenCalled();
  });

  it('is unauthenticated without a bearer or with a dead token, and 429 over budget', async () => {
    const a = mcpActors();
    await expect(a.resolveMcpActor(request())).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(a.resolveMcpActor(request(`Bearer candydati_oat_${'B'.repeat(32)}`))).rejects.toBeInstanceOf(UnauthenticatedError);
    const limited = mcpActors(vi.fn(() => ({ allowed: false, retryAfterMs: 5 })));
    await expect(limited.resolveMcpActor(request(`Bearer ${OAUTH}`))).rejects.toMatchObject({ statusCode: 429 });
  });

  it('never accepts an OAuth token on the REST api: it is bound to the MCP resource', async () => {
    const a = mcpActors();
    await expect(a.resolveActor(request(`Bearer ${OAUTH}`))).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(a.authenticateConnectedApp).not.toHaveBeenCalled();
  });
});
