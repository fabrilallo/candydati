import {
  createWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  listWebhooks,
  testWebhook,
  toCreatedWebhookDto,
  toWebhookDeliveryDto,
  toWebhookEndpointDto,
  updateWebhook,
} from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/** Organization webhooks. The signing secret is in the creation response only; no read returns it again. */
export function registerWebhookRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.webhookDeps;
  const endpointId = (request: Parameters<typeof paramOf>[0]) => paramOf(request, 'id');

  app.get('/api/v1/webhooks', async (request) => ok((await listWebhooks(deps, await ctx.resolveActor(request), {})).map(toWebhookEndpointDto)));

  app.post('/api/v1/webhooks', async (request, reply) =>
    reply.status(201).send(ok(toCreatedWebhookDto(await createWebhook(deps, await ctx.resolveActor(request), bodyOf(request))))),
  );

  app.put('/api/v1/webhooks/:id', async (request) =>
    ok(toWebhookEndpointDto(await updateWebhook(deps, await ctx.resolveActor(request), { ...bodyOf(request), endpointId: endpointId(request) }))),
  );

  app.delete('/api/v1/webhooks/:id', async (request) => {
    await deleteWebhook(deps, await ctx.resolveActor(request), { endpointId: endpointId(request) });
    return ok({ deleted: true });
  });

  app.post('/api/v1/webhooks/:id/test', async (request) => ok(await testWebhook(deps, await ctx.resolveActor(request), { endpointId: endpointId(request) })));

  app.get('/api/v1/webhooks/:id/deliveries', async (request) =>
    ok((await listWebhookDeliveries(deps, await ctx.resolveActor(request), { endpointId: endpointId(request) })).map(toWebhookDeliveryDto)),
  );
}
