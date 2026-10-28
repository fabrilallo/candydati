import { exportReportsCsv, getJobTraffic, getReports } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { contentDisposition } from '../http/content-disposition.js';
import { paramOf } from './request.js';

/** The query goes to the use case as is: it validates the period and the job. */
const queryOf = (request: FastifyRequest): unknown => request.query ?? {};

/** Aggregates of the active organization, numbers only. The use cases validate, authorize and compute. */
export function registerReportRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/reports', async (request) => ok(await getReports(ctx.reportDeps, await ctx.resolveActor(request), queryOf(request) as never)));

  app.get('/api/v1/jobs/:id/traffic', async (request) =>
    ok(await getJobTraffic(ctx.reportDeps, await ctx.resolveActor(request), { ...(queryOf(request) as object), jobId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/reports/export.csv', async (request, reply) => {
    const file = await exportReportsCsv(ctx.reportDeps, await ctx.resolveActor(request), queryOf(request) as never);
    return reply
      .header('content-type', file.mediaType)
      .header('content-disposition', contentDisposition('attachment', file.fileName))
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(file.csv);
  });
}
