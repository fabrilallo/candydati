import { getInstanceEmailSettings, updateInstanceEmailSettings } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** How the instance sends email: read by every member, changed by the instance administrator after a test email. */
export function registerInstanceEmailRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.instanceEmailDeps;

  app.get('/api/v1/instance/email-settings', async (request) => ok(await getInstanceEmailSettings(deps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/instance/email-settings', async (request) => ok(await updateInstanceEmailSettings(deps, await ctx.resolveActor(request), request.body)));
}
