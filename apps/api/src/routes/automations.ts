import {
  copyAutomations,
  createAutomation,
  deleteAutomation,
  deleteTemplateAutomation,
  listAutomationRuns,
  listAutomations,
  listTemplateAutomations,
  previewAutomation,
  toAutomationRuleDto,
  toCopyAutomationsResultDto,
  toTemplateAutomationRuleDto,
  updateAutomation,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { registerMoveProposalRoutes } from './move-proposals.js';
import { asNumber, bodyOf, paramOf, queryOf } from './request.js';

/**
 * Per-job, per-stage rules: when a trigger fires and the conditions hold, send a template, create a task, tag, assign,
 * ask for feedback, alert, or propose a move that a person confirms. Never move or decide.
 */
export function registerAutomationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.automationDeps;

  app.get('/api/v1/jobs/:id/automations', async (request) =>
    ok((await listAutomations(deps, await ctx.resolveActor(request), { jobId: paramOf(request, 'id') })).map(toAutomationRuleDto)),
  );

  app.post('/api/v1/jobs/:id/automations', async (request, reply) => {
    const rule = await createAutomation(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') });
    return reply.status(201).send(ok(toAutomationRuleDto(rule)));
  });

  // A POST because the rule being edited travels in the body; it reads and writes nothing.
  app.post('/api/v1/jobs/:id/automations/preview', async (request) =>
    ok(await previewAutomation(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') })),
  );

  app.get('/api/v1/automations/:id/runs', async (request) =>
    ok(await listAutomationRuns(deps, await ctx.resolveActor(request), { ruleId: paramOf(request, 'id'), ...(queryOf(request).limit === undefined ? {} : { limit: asNumber(queryOf(request).limit) }) })),
  );

  app.put('/api/v1/automations/:id', async (request) =>
    ok(toAutomationRuleDto(await updateAutomation(deps, await ctx.resolveActor(request), { ...bodyOf(request), ruleId: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/automations/:id', async (request) => {
    await deleteAutomation(deps, await ctx.resolveActor(request), { ruleId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });

  app.post('/api/v1/automations/copy', async (request, reply) => {
    const result = await copyAutomations(deps, await ctx.resolveActor(request), bodyOf(request));
    return reply.status(201).send(ok(toCopyAutomationsResultDto(result)));
  });

  app.get('/api/v1/job-templates/:id/automations', async (request) =>
    ok((await listTemplateAutomations(deps, await ctx.resolveActor(request), { templateId: paramOf(request, 'id') })).map(toTemplateAutomationRuleDto)),
  );

  app.delete('/api/v1/job-template-automations/:id', async (request) => {
    await deleteTemplateAutomation(deps, await ctx.resolveActor(request), { ruleId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });

  registerMoveProposalRoutes(app, ctx);
}
