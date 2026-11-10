import { bookInterview, cancelInterviewByCandidate, getInterviewInvitation } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { feedbackRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

const NO_STORE = 'no-store';

/**
 * The candidate's booking page: the personal token in the path is the only credential, no session, no cookie read.
 * Never cached; the same rate limit as the feedback links. Unknown, expired or closed links are a 404; a time taken
 * meanwhile or a change too late is a 409.
 */
export function registerPublicInterviewRoutes(app: FastifyInstance, ctx: AppContext): void {
  const config = feedbackRouteConfig(ctx);
  const deps = ctx.interviewDeps;

  app.get('/api/v1/public/interviews/:token', { config }, async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await getInterviewInvitation(deps, { token: paramOf(request, 'token') }))),
  );

  app.post('/api/v1/public/interviews/:token/book', { config }, async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await bookInterview(deps, { slot: bodyOf(request).slot, token: paramOf(request, 'token') }))),
  );

  app.post('/api/v1/public/interviews/:token/cancel', { config }, async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await cancelInterviewByCandidate(deps, { token: paramOf(request, 'token') }))),
  );
}
