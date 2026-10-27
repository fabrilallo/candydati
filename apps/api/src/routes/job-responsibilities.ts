import { suggestResponsibilities } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { qualityRouteConfig } from './limits.js';

/** Proposals for the responsibilities of an unsaved ad. A static path, so it never collides with `/jobs/:id`. */
export function registerJobResponsibilitiesRoute(app: FastifyInstance, ctx: AppContext): void {
  const deps = {
    ...ctx.core,
    suggester: ctx.responsibilitySuggester,
    // Never the ad text: only what went wrong.
    onSuggestError: (error: unknown) => app.log.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'responsibility suggestions failed'),
  };
  app.post('/api/v1/jobs/responsibilities/suggest', { bodyLimit: 32 * 1024, config: qualityRouteConfig(ctx) }, async (request) =>
    ok(await suggestResponsibilities(deps, await ctx.resolveActor(request), request.body)),
  );
}
