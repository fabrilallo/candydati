import { decideApplication, getPipeline, moveApplication, toApplicationCardDto, toPipelineDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Pipeline board of a job and the two transitions of an application. */
export function registerPipelineRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.candidateDeps;

  app.get('/api/v1/jobs/:id/pipeline', async (request) =>
    ok(toPipelineDto(await getPipeline(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') }))),
  );

  app.post('/api/v1/applications/:id/move', async (request) => {
    const input = { ...bodyOf(request), applicationId: paramOf(request, 'id') };
    return ok(toApplicationCardDto(await moveApplication(deps, await ctx.resolveActor(request), input)));
  });

  app.post('/api/v1/applications/:id/decide', async (request) => {
    const input = { ...bodyOf(request), applicationId: paramOf(request, 'id') };
    return ok(toApplicationCardDto(await decideApplication(deps, await ctx.resolveActor(request), input)));
  });
}
