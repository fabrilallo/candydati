import { closeJob, createJob, duplicateStage, getJob, listJobs, publishJob, toJobDto, toJobSummaryDto, toPublishJobResultDto, updateJob, type DuplicateStageDeps } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { AD_BODY_LIMIT } from './limits.js';
import { paramOf } from './request.js';

interface IdParams {
  readonly id: string;
}

const withId = (request: FastifyRequest, extra: object = {}) => ({ ...extra, jobId: (request.params as IdParams).id });
const bodyOf = (request: FastifyRequest): object => (typeof request.body === 'object' && request.body !== null ? request.body : {});

/** The job and what is tied to its stages, all from the same unit of work so one transaction covers the copy. */
const stageDuplicationDeps = (ctx: AppContext): DuplicateStageDeps => ({
  ...ctx.jobDeps,
  jobTeams: ctx.jobTeamDeps.jobTeams,
  stageInterviewers: ctx.jobTeamDeps.stageInterviewers,
  members: ctx.jobTeamDeps.members,
  scorecards: ctx.feedbackDeps.scorecards,
});

/** Thin adapters: actor, use case (validates and authorizes), DTO. */
export function registerJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { jobDeps: deps } = ctx;
  const limit = { bodyLimit: AD_BODY_LIMIT };
  const duplicationDeps = stageDuplicationDeps(ctx);

  app.get('/api/v1/jobs', async (request) => {
    const { items, meta, clients } = await listJobs(deps, await ctx.resolveActor(request), request.query);
    return ok(items.map((job) => ({ ...toJobSummaryDto(job, deps), client: clients[job.id] ?? null })), meta);
  });

  app.post('/api/v1/jobs', limit, async (request, reply) => {
    const job = await createJob(deps, await ctx.resolveActor(request), request.body);
    return reply.status(201).send(ok(toJobDto(job, deps)));
  });

  app.get('/api/v1/jobs/:id', async (request) => ok(toJobDto(await getJob(deps, await ctx.resolveActor(request), withId(request)), deps)));

  app.put('/api/v1/jobs/:id', limit, async (request) =>
    ok(toJobDto(await updateJob(deps, await ctx.resolveActor(request), withId(request, bodyOf(request))), deps)),
  );

  app.post('/api/v1/jobs/:id/stages/:stageId/duplicate', async (request) => {
    const result = await duplicateStage(duplicationDeps, await ctx.resolveActor(request), withId(request, { stageId: paramOf(request, 'stageId') }));
    return ok({ job: toJobDto(result.job, deps), stageId: result.stageId, copied: result.copied, skipped: result.skipped });
  });

  app.post('/api/v1/jobs/:id/publish', async (request) =>
    ok(toPublishJobResultDto(await publishJob(deps, await ctx.resolveActor(request), withId(request)), deps)),
  );

  app.post('/api/v1/jobs/:id/close', async (request) =>
    ok(toJobDto(await closeJob(deps, await ctx.resolveActor(request), withId(request)), deps)),
  );
}
