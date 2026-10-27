import { closeJob, createJob, getJob, listJobs, publishJob, toJobDto, toJobSummaryDto, toPublishJobResultDto, updateJob } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { AD_BODY_LIMIT } from './limits.js';

interface IdParams {
  readonly id: string;
}

const withId = (request: FastifyRequest, extra: object = {}) => ({ ...extra, jobId: (request.params as IdParams).id });
const bodyOf = (request: FastifyRequest): object => (typeof request.body === 'object' && request.body !== null ? request.body : {});

/** Thin adapters: actor, use case (validates and authorizes), DTO. */
export function registerJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { jobDeps: deps } = ctx;
  const limit = { bodyLimit: AD_BODY_LIMIT };

  app.get('/api/v1/jobs', async (request) => {
    const { items, meta } = await listJobs(deps, await ctx.resolveActor(request), request.query);
    return ok(items.map((job) => toJobSummaryDto(job, deps)), meta);
  });

  app.post('/api/v1/jobs', limit, async (request, reply) => {
    const job = await createJob(deps, await ctx.resolveActor(request), request.body);
    return reply.status(201).send(ok(toJobDto(job, deps)));
  });

  app.get('/api/v1/jobs/:id', async (request) => ok(toJobDto(await getJob(deps, await ctx.resolveActor(request), withId(request)), deps)));

  app.put('/api/v1/jobs/:id', limit, async (request) =>
    ok(toJobDto(await updateJob(deps, await ctx.resolveActor(request), withId(request, bodyOf(request))), deps)),
  );

  app.post('/api/v1/jobs/:id/publish', async (request) =>
    ok(toPublishJobResultDto(await publishJob(deps, await ctx.resolveActor(request), withId(request)), deps)),
  );

  app.post('/api/v1/jobs/:id/close', async (request) =>
    ok(toJobDto(await closeJob(deps, await ctx.resolveActor(request), withId(request)), deps)),
  );
}
