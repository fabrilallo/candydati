import { recordJobView } from '@candydati/core';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { viewRouteConfig } from './limits.js';
import { paramOf } from './request.js';

/**
 * The visit beacon of the public job page. Public, no session, no body: the labels ride in the query (a beacon with no body
 * is a simple cross-origin request, so no preflight). Always `204`: it is a counter, and it must not say whether the
 * organization or the ad exists. The IP is used by the rate limiter only and the user agent only to leave crawlers out;
 * neither is stored. Not cacheable.
 */
export function registerPublicViewRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/v1/public/organizations/:orgSlug/jobs/:jobSlug/view', { config: viewRouteConfig(ctx) }, async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    await recordJobView(ctx.jobViewDeps, {
      organizationSlug: paramOf(request, 'orgSlug'),
      jobSlug: paramOf(request, 'jobSlug'),
      source: typeof query.source === 'string' ? query.source : undefined,
      campaign: typeof query.campaign === 'string' ? query.campaign : undefined,
      userAgent: request.headers['user-agent'],
    });
    return reply.header('cache-control', 'no-store').status(204).send();
  });
}
