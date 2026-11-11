import { cancelInterview, getInterviewDefaults, listApplicationInterviews, proposeInterview } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf, queryOf } from './request.js';

/** Interviews of an application: thin adapters over the interview use cases (same permissions everywhere). */
export function registerInterviewRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.interviewDeps;

  app.get('/api/v1/applications/:id/interviews', async (request) =>
    ok(await listApplicationInterviews(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/applications/:id/interviews/defaults', async (request) =>
    ok(await getInterviewDefaults(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id'), stageId: String(queryOf(request).stageId ?? '') })),
  );

  app.post('/api/v1/applications/:id/interviews', async (request, reply) => {
    const result = await proposeInterview(deps, await ctx.resolveActor(request), { ...bodyOf(request), applicationId: paramOf(request, 'id') });
    return reply.status(201).send(ok(result));
  });

  app.post('/api/v1/interviews/:id/cancel', async (request) => ok(await cancelInterview(deps, await ctx.resolveActor(request), { interviewId: paramOf(request, 'id') })));
}
