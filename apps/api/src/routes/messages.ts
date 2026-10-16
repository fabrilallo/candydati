import { listMessages, sendMessage, toMessageDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Sending is always a person's decision; the conversation of an application is read oldest first. */
export function registerMessageRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.messagingDeps;

  app.post('/api/v1/messages', async (request) => {
    const { queued, failed } = await sendMessage(deps, await ctx.resolveActor(request), bodyOf(request));
    return ok({ queued, failed });
  });

  app.get('/api/v1/applications/:id/messages', async (request) =>
    ok((await listMessages(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') })).map(toMessageDto)),
  );
}
