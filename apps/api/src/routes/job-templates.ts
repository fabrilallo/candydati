import { createJobTemplate, deleteJobTemplate, listJobTemplates, toJobTemplateDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { AD_BODY_LIMIT } from './limits.js';

export function registerJobTemplateRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { jobDeps: deps } = ctx;

  app.get('/api/v1/job-templates', async (request) => {
    const templates = await listJobTemplates(deps, await ctx.resolveActor(request), request.query ?? {});
    return ok(templates.map(toJobTemplateDto));
  });

  app.post('/api/v1/job-templates', { bodyLimit: AD_BODY_LIMIT }, async (request, reply) => {
    const template = await createJobTemplate(deps, await ctx.resolveActor(request), request.body);
    return reply.status(201).send(ok(toJobTemplateDto(template)));
  });

  app.delete('/api/v1/job-templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { templateId } = await deleteJobTemplate(deps, await ctx.resolveActor(request), { templateId: id });
    return ok({ id: templateId });
  });
}
