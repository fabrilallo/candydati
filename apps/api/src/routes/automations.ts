import { createAutomation, deleteAutomation, listAutomations, toAutomationRuleDto, updateAutomation } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Per-job, per-stage rules: send a template or create a task when an application enters a stage. Never move or decide. */
export function registerAutomationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.automationDeps;

  app.get('/api/v1/jobs/:id/automations', async (request) =>
    ok((await listAutomations(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })).map(toAutomationRuleDto)),
  );

  app.post('/api/v1/jobs/:id/automations', async (request, reply) => {
    const rule = await createAutomation(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') });
    return reply.status(201).send(ok(toAutomationRuleDto(rule)));
  });

  app.put('/api/v1/automations/:id', async (request) =>
    ok(toAutomationRuleDto(await updateAutomation(deps, await ctx.resolveActor(request), { ...bodyOf(request), ruleId: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/automations/:id', async (request) => {
    await deleteAutomation(deps, await ctx.resolveActor(request), { ruleId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });
}
