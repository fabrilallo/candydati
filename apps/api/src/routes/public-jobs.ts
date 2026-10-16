import { getPublicCareers, getPublicFeed, getPublicJob, getPublicOrganizationSummary } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { openPublicReads } from '../plugins/public-cors.js';
import { publicRouteConfig } from './limits.js';
import { paramOf } from './request.js';

export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

/**
 * The public read-only API: no session, CORS open for GET, cacheable. Only a successful reply is cacheable: errors never
 * get the header. Everything here is data an organization chose to publish.
 */
export function registerPublicJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  void app.register(async (scope) => {
    openPublicReads(scope);
    registerReads(scope, ctx);
  });
}

function registerReads(app: FastifyInstance, ctx: AppContext): void {
  const config = publicRouteConfig(ctx);
  const { publicSiteDeps: deps } = ctx;
  const cached = <T>(reply: { header(name: string, value: string): { send(payload: unknown): T } }, data: unknown): T =>
    reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(ok(data));

  app.get('/api/v1/public/organizations/:orgSlug', { config }, async (request, reply) =>
    cached(reply, await getPublicOrganizationSummary(deps, { organizationSlug: paramOf(request, 'orgSlug') })),
  );

  app.get('/api/v1/public/organizations/:orgSlug/jobs', { config }, async (request, reply) =>
    cached(reply, await getPublicCareers(deps, { organizationSlug: paramOf(request, 'orgSlug') })),
  );

  app.get('/api/v1/public/organizations/:orgSlug/feed', { config }, async (request, reply) =>
    cached(reply, await getPublicFeed(deps, { organizationSlug: paramOf(request, 'orgSlug') })),
  );

  app.get('/api/v1/public/organizations/:orgSlug/jobs/:jobSlug', { config }, async (request, reply) =>
    cached(reply, await getPublicJob(deps, { organizationSlug: paramOf(request, 'orgSlug'), jobSlug: paramOf(request, 'jobSlug') })),
  );
}
