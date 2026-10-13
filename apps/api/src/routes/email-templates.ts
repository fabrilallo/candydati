import { deleteEmailTemplate, listEmailTemplates, previewMessage, saveEmailTemplate, toEmailTemplateDto } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Templates with variables. Ids of built-in defaults are `default:<kind>`; deleting an edited default restores it. */
export function registerEmailTemplateRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.messagingDeps;

  app.get('/api/v1/email-templates', async (request) =>
    ok((await listEmailTemplates(deps, await ctx.resolveActor(request), {})).map(toEmailTemplateDto)),
  );

  app.post('/api/v1/email-templates', async (request, reply) => {
    const view = await saveEmailTemplate(deps, await ctx.resolveActor(request), bodyOf(request));
    return reply.status(201).send(ok(toEmailTemplateDto(view)));
  });

  app.put('/api/v1/email-templates/:id', async (request) =>
    ok(toEmailTemplateDto(await saveEmailTemplate(deps, await ctx.resolveActor(request), { ...bodyOf(request), id: paramOf(request, 'id') }))),
  );

  app.delete('/api/v1/email-templates/:id', async (request) => {
    const removed = await deleteEmailTemplate(deps, await ctx.resolveActor(request), { id: paramOf(request, 'id') });
    return ok({ id: removed.id });
  });

  app.post('/api/v1/email-templates/preview', async (request) =>
    ok(await previewMessage(deps, await ctx.resolveActor(request), bodyOf(request))),
  );
}
