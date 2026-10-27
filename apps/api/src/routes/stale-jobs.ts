import { listStaleJobs, toJobSummaryDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** The "Annunci fermi" tab: published ads with no activity for 90 days. Listed, never closed. */
export function registerStaleJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/jobs/stale', async (request) => {
    const items = await listStaleJobs(ctx.staleJobDeps, await ctx.resolveActor(request), {});
    return ok(items.map(({ job, lastActivityAt, daysIdle }) => ({ job: toJobSummaryDto(job, ctx.jobDeps), lastActivityAt: lastActivityAt.toISOString(), daysIdle })));
  });
}
