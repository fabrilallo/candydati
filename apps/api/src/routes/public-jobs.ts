import { getPublicCareers, getPublicJob } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { publicRouteConfig } from './limits.js';

export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

interface OrgParams {
  readonly orgSlug: string;
  readonly jobSlug?: string;
}

/** No session needed. Only a successful reply is cacheable: errors never get the header. */
export function registerPublicJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  const config = publicRouteConfig(ctx);
  const deps = { jobs: ctx.jobDeps.jobs, organizations: ctx.jobDeps.organizations };

  app.get('/api/v1/public/organizations/:orgSlug/jobs', { config }, async (request, reply) => {
    const { orgSlug } = request.params as OrgParams;
    const careers = await getPublicCareers(deps, { organizationSlug: orgSlug });
    return reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(ok(careers));
  });

  app.get('/api/v1/public/organizations/:orgSlug/jobs/:jobSlug', { config }, async (request, reply) => {
    const { orgSlug, jobSlug } = request.params as OrgParams;
    const page = await getPublicJob(deps, { organizationSlug: orgSlug, jobSlug });
    return reply.header('cache-control', PUBLIC_CACHE_CONTROL).send(ok(page));
  });
}
