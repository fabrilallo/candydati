import { getJobInterviewers, getJobScorecard, listApplicationFeedback, requestFeedback, setJobInterviewers, setJobScorecard, suggestScorecardCriteria } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { qualityRouteConfig } from './limits.js';
import { bodyOf, paramOf } from './request.js';

/** Interviewers per stage, the scorecard and feedback requests: thin adapters over the feedback use cases. */
export function registerFeedbackRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.feedbackDeps;

  app.get('/api/v1/jobs/:id/interviewers', async (request) => ok(await getJobInterviewers(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })));

  app.put('/api/v1/jobs/:id/interviewers', async (request) =>
    ok(await setJobInterviewers(deps, await ctx.resolveActor(request), { stages: bodyOf(request).stages, jobId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/jobs/:id/scorecard', async (request) => ok(await getJobScorecard(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })));

  app.put('/api/v1/jobs/:id/scorecard', async (request) => {
    const { changes: _changes, ...view } = await setJobScorecard(deps, await ctx.resolveActor(request), { criteria: bodyOf(request).criteria, jobId: paramOf(request, 'id') });
    return ok(view);
  });

  const suggestDeps = {
    ...deps,
    criteriaDrafter: ctx.criteriaDrafter,
    // Never the ad text: only what went wrong.
    onSuggestError: (error: unknown) => app.log.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'scorecard suggestions failed'),
  };
  app.post('/api/v1/jobs/:id/scorecard/suggest', { config: qualityRouteConfig(ctx) }, async (request) =>
    ok(await suggestScorecardCriteria(suggestDeps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/applications/:id/feedback', async (request) =>
    ok(await listApplicationFeedback(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') })),
  );

  app.post('/api/v1/applications/:id/feedback/request', async (request, reply) => {
    const created = await requestFeedback(deps, await ctx.resolveActor(request), { ...bodyOf(request), applicationId: paramOf(request, 'id') });
    return reply.status(201).send(ok(created));
  });
}
