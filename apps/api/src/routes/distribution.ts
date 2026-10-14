import { getDistributionOverview, getJobDistribution, setChannelEnabled, syncJobDistribution } from '@tt/core';
import { ok } from '@tt/domain';
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
}
