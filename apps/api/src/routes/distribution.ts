import { createTrackedLink, getDistributionOverview, getJobDistribution, listTrackedLinks, removeTrackedLink, setChannelEnabled, syncJobDistribution } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Where the ads go: the XML feed and the registered channels (none in the self-hosted default). Thin adapters. */
export function registerDistributionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.distributionDeps;

  app.get('/api/v1/jobs/:id/distribution', async (request) =>
    ok(await getJobDistribution(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })),
  );

  app.post('/api/v1/jobs/:id/distribution/sync', async (request) =>
    ok((await syncJobDistribution(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })).distribution),
  );

  app.get('/api/v1/distribution', async (request) => ok(await getDistributionOverview(deps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/distribution/channels/:channelId', async (request) =>
    ok(await setChannelEnabled(deps, await ctx.resolveActor(request), { ...bodyOf(request), channelId: paramOf(request, 'channelId') })),
  );

  const links = ctx.trackedLinkDeps;
  app.get('/api/v1/jobs/:id/tracked-links', async (request) =>
    ok(await listTrackedLinks(links, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })),
  );

  // 201 for a new link, 200 when the same channel and campaign were already saved.
  app.post('/api/v1/jobs/:id/tracked-links', async (request, reply) => {
    const saved = await createTrackedLink(links, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') });
    return reply.status(saved.created ? 201 : 200).send(ok(saved));
  });

  app.delete('/api/v1/jobs/:id/tracked-links/:linkId', async (request) =>
    ok(await removeTrackedLink(links, await ctx.resolveActor(request), { jobId: paramOf(request, 'id'), linkId: paramOf(request, 'linkId') })),
  );
}
