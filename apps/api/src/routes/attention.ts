import { decideApplications, listAttention, toAttentionItemDtos } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asNumber, bodyOf, queryOf } from './request.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** The "Da gestire" list (applications due soon or overdue) and the bulk decision used before closing a job. */
export function registerAttentionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.candidateDeps;

  app.get('/api/v1/applications/attention', async (request) => {
    const query = queryOf(request);
    const input = withoutUndefined({ state: query.state, page: asNumber(query.page), limit: asNumber(query.limit) });
    const page = await listAttention(deps, await ctx.resolveActor(request), input);
    return ok(toAttentionItemDtos(page), { total: page.total, page: page.page, limit: page.limit });
  });

  app.post('/api/v1/applications/decide', async (request) => ok(await decideApplications(deps, await ctx.resolveActor(request), bodyOf(request))));
}
