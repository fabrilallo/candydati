import { getInstanceAiSettings, updateInstanceAiSettings } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** Which AI models the instance uses: read by every member, changed by the instance administrator after a test call. */
export function registerInstanceAiRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.instanceAiDeps;

  app.get('/api/v1/instance/ai-settings', async (request) => ok(await getInstanceAiSettings(deps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/instance/ai-settings', async (request) => ok(await updateInstanceAiSettings(deps, await ctx.resolveActor(request), request.body)));
}
