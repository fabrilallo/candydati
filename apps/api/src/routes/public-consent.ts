import { answerConsentRequest, getConsentRequest, toConsentRequestDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { consentRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

const NO_STORE = 'no-store';

/**
 * Reconfirmation of an imported candidate: the single-use token in the path is the only credential, there is no session.
 * Never cached (the link is personal) and never opened to other origins: the web app calls it from its own server. An
 * unknown, expired or erased token is a 404, a token already used a 409.
 */
export function registerPublicConsentRoutes(app: FastifyInstance, ctx: AppContext): void {
  const config = consentRouteConfig(ctx);
  const deps = ctx.consentDeps;

  app.get('/api/v1/public/consent/:token', { config }, async (request, reply) => {
    const found = await getConsentRequest(deps, { token: paramOf(request, 'token') });
    return reply.header('cache-control', NO_STORE).send(ok(toConsentRequestDto(found)));
  });

  app.post('/api/v1/public/consent/:token', { config }, async (request, reply) => {
    const result = await answerConsentRequest(deps, { ...bodyOf(request), token: paramOf(request, 'token') });
    return reply.header('cache-control', NO_STORE).send(ok(result));
  });
}
