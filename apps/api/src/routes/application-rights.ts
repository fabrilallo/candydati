import { eraseApplication, toCandidateDetailDto, withdrawConsent } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Erasure of one application and withdrawal of consent. */
export function registerApplicationRightsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.rightsDeps;

  app.post('/api/v1/applications/:id/erase', async (request) => {
    await eraseApplication(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id'), confirmName: bodyOf(request).confirmName });
    return ok({ erased: true as const });
  });

  app.post('/api/v1/applications/:id/withdraw-consent', async (request) => {
    const result = await withdrawConsent(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id'), scope: bodyOf(request).scope });
    return ok(result.erased ? { erased: true as const } : toCandidateDetailDto(result.detail));
  });
}
