import {
  attachPack,
  createPack,
  createPackRule,
  deletePack,
  deletePackRule,
  listPackRules,
  listPacks,
  listTemplatePacks,
  setTemplatePacks,
  toAttachPackResultDto,
  toAutomationPackDto,
  toAutomationPackRuleDto,
  toPackSummaryDto,
  updatePack,
  updatePackRule,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/**
 * Automation packs: rules kept once by the organization, anchored to stage types, copied into the jobs they are attached
 * to and brought by the job templates that reference them.
 */
export function registerAutomationPackRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.automationDeps;

  app.get('/api/v1/automation-packs', async (request) => ok((await listPacks(deps, await ctx.resolveActor(request), {})).map(toPackSummaryDto)));

  app.post('/api/v1/automation-packs', async (request, reply) => {
    const pack = await createPack(deps, await ctx.resolveActor(request), bodyOf(request));
    return reply.status(201).send(ok(toAutomationPackDto(pack)));
  });

  app.put('/api/v1/automation-packs/:id', async (request) =>
    ok(toAutomationPackDto(await updatePack(deps, await ctx.resolveActor(request), { ...bodyOf(request), packId: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/automation-packs/:id', async (request) => {
    await deletePack(deps, await ctx.resolveActor(request), { packId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });

  app.get('/api/v1/automation-packs/:id/rules', async (request) =>
    ok((await listPackRules(deps, await ctx.resolveActor(request), { packId: paramOf(request, 'id') })).map(toAutomationPackRuleDto)),
  );

  app.post('/api/v1/automation-packs/:id/rules', async (request, reply) => {
    const rule = await createPackRule(deps, await ctx.resolveActor(request), { ...bodyOf(request), packId: paramOf(request, 'id') });
    return reply.status(201).send(ok(toAutomationPackRuleDto(rule)));
  });

  app.put('/api/v1/automation-pack-rules/:id', async (request) =>
    ok(toAutomationPackRuleDto(await updatePackRule(deps, await ctx.resolveActor(request), { ...bodyOf(request), ruleId: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/automation-pack-rules/:id', async (request) => {
    await deletePackRule(deps, await ctx.resolveActor(request), { ruleId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });

  // Attaching again replaces the job's earlier copies of the same pack.
  app.post('/api/v1/jobs/:id/automation-packs', async (request, reply) => {
    const result = await attachPack(deps, await ctx.resolveActor(request), { ...bodyOf(request), jobId: paramOf(request, 'id') });
    return reply.status(201).send(ok(toAttachPackResultDto(result)));
  });

  app.get('/api/v1/job-templates/:id/automation-packs', async (request) =>
    ok({ packIds: await listTemplatePacks(deps, await ctx.resolveActor(request), { templateId: paramOf(request, 'id') }) }),
  );

  app.put('/api/v1/job-templates/:id/automation-packs', async (request) =>
    ok({ packIds: await setTemplatePacks(deps, await ctx.resolveActor(request), { ...bodyOf(request), templateId: paramOf(request, 'id') }) }),
  );
}
