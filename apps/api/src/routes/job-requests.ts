import {
  approveJobRequest,
  convertJobRequest,
  getApprovalSetting,
  getJobApprovalStatus,
  getJobRequest,
  listJobRequests,
  rejectJobRequest,
  requestJobApproval,
  setApprovalSetting,
  submitJobRequest,
  toJobDto,
} from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asNumber, bodyOf, paramOf, queryOf } from './request.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** Intake of positions, approval of budget and RAL, and the organization setting that turns approval on. */
export function registerJobRequestRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.jobRequestDeps;
  const requestId = (request: Parameters<typeof paramOf>[0]) => ({ requestId: paramOf(request, 'id') });

  app.get('/api/v1/job-requests', async (request) => {
    const query = queryOf(request);
    const page = await listJobRequests(deps, await ctx.resolveActor(request), withoutUndefined({ status: query.status, page: asNumber(query.page), limit: asNumber(query.limit) }));
    const limit = Number(asNumber(query.limit) ?? 20);
    return ok(page.items, { total: page.total, page: Number(asNumber(query.page) ?? 1), limit });
  });

  app.post('/api/v1/job-requests', async (request, reply) => reply.status(201).send(ok(await submitJobRequest(deps, await ctx.resolveActor(request), request.body))));

  app.get('/api/v1/job-requests/:id', async (request) => ok(await getJobRequest(deps, await ctx.resolveActor(request), requestId(request))));

  app.post('/api/v1/job-requests/:id/approve', async (request) =>
    ok(await approveJobRequest(deps, await ctx.resolveActor(request), { ...bodyOf(request), ...requestId(request) })),
  );

  app.post('/api/v1/job-requests/:id/reject', async (request) =>
    ok(await rejectJobRequest(deps, await ctx.resolveActor(request), { ...bodyOf(request), ...requestId(request) })),
  );

  app.post('/api/v1/job-requests/:id/convert', async (request, reply) =>
    reply.status(201).send(ok(toJobDto(await convertJobRequest(deps, await ctx.resolveActor(request), requestId(request))))),
  );

  app.get('/api/v1/settings/approval', async (request) => ok(await getApprovalSetting(deps, await ctx.resolveActor(request), {})));

  app.put('/api/v1/settings/approval', async (request) => ok(await setApprovalSetting(deps, await ctx.resolveActor(request), request.body)));

  // A draft that did not come from a request asks for approval with the same flow.
  app.get('/api/v1/jobs/:id/approval', async (request) => ok(await getJobApprovalStatus(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })));

  app.post('/api/v1/jobs/:id/approval-request', async (request, reply) =>
    reply.status(201).send(ok(await requestJobApproval(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') }))),
  );
}
