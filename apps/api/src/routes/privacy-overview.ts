import { getProcessingRecord, getRetentionOverview } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { toProcessingRecordDto, toRetentionOverviewDto } from './privacy-dto.js';

/** What the retention job will do and the data of the record of processing activities (GDPR art. 30). Owner and admin. */
export function registerPrivacyOverviewRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.overviewDeps;

  app.get('/api/v1/privacy/retention', async (request) => ok(toRetentionOverviewDto(await getRetentionOverview(deps, await ctx.resolveActor(request), {}))));

  app.get('/api/v1/privacy/processing-record', async (request) =>
    ok(toProcessingRecordDto(await getProcessingRecord(deps, await ctx.resolveActor(request), {}), deps.now())),
  );
}
