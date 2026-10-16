import { getJobStats } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** Dashboard aggregates of the active organization. The use case validates, authorizes and computes. */
export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/stats/jobs', async (request) => ok(await getJobStats(ctx.jobDeps, await ctx.resolveActor(request), {})));
}
