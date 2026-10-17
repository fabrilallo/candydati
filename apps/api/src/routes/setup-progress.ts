import { getSetupProgress } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** The setup checklist of the organization (yes or no per step): the dashboard shows it until everything is done. */
export function registerSetupProgressRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/setup-progress', async (request) => ok(await getSetupProgress(ctx.setupProgressDeps, await ctx.resolveActor(request), {})));
}
