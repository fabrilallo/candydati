import { analyzeJobAd } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { AD_BODY_LIMIT, qualityRouteConfig } from './limits.js';

/** Live feedback on unsaved content. A static path, so it never collides with `/jobs/:id`. */
export function registerJobQualityRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/v1/jobs/quality', { bodyLimit: AD_BODY_LIMIT, config: qualityRouteConfig(ctx) }, async (request) =>
    ok(await analyzeJobAd(ctx.jobDeps, await ctx.resolveActor(request), request.body)),
  );
}
