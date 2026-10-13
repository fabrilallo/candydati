import { fail } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import { hasBearer } from '../http/bearer.js';

/** Provider webhooks are server-to-server: they carry a signature, not a session. */
const WEBHOOK_PREFIX = '/api/v1/inbound/';
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cookie-authenticated `/api/v1/*` writes are not covered by Better Auth's origin check, so enforce it here:
 * a request that declares an Origin must come from a trusted one. No Origin (curl, server-to-server) passes.
 */
export function registerCsrfProtection(app: FastifyInstance, trusted: readonly string[]): void {
  const allowed = new Set(trusted);
  app.addHook('onRequest', async (request, reply) => {
    // A bearer request carries no cookie (the resolver ignores them), so there is no ambient credential to forge.
    if (hasBearer(request.headers)) return;
    if (!STATE_CHANGING.has(request.method) || !request.url.startsWith('/api/v1/') || request.url.startsWith(WEBHOOK_PREFIX)) return;
    const origin = request.headers.origin;
    if (origin === undefined || allowed.has(origin)) return;
    return reply.status(403).send(fail('forbidden', 'Origin not allowed.'));
  });
}
