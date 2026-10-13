import { checkWebhookUrl, webhookEndpointInputSchema, type WebhookDelivery, type WebhookEndpoint } from '@tt/domain';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { WebhookDeps } from '../../webhook-ports.js';
import { defineWebhookUseCase } from './define.js';

const DELIVERY_LOG_LIMIT = 100;

async function requireEndpoint(deps: WebhookDeps, organizationId: string, id: string): Promise<WebhookEndpoint> {
  const endpoint = await deps.endpoints.findById(organizationId, id);
  if (!endpoint) throw new NotFoundError('Webhook endpoint not found.');
  return endpoint;
}

function assertUrl(deps: WebhookDeps, url: string): void {
  const issue = checkWebhookUrl(url, deps.allowPrivateWebhooks);
  if (issue) throw new ValidationError([{ path: 'url', message: issue }]);
}

/** What the caller gets back when creating: the ONLY time the signing secret is ever returned. */
export interface CreatedWebhook {
  readonly endpoint: WebhookEndpoint;
  readonly secret: string;
}

export const listWebhooks = defineWebhookUseCase({
  name: 'listWebhooks',
  input: z.object({}),
  permission: 'webhook:manage',
  audit: { skip: 'read of organization settings' },
  handler: ({ deps, actor }): Promise<readonly WebhookEndpoint[]> => deps.endpoints.list(actor.organizationId),
});

/** Generates the secret (`deps.newSecret`). Callers must show it once and never read it back (DTOs drop it). */
export const createWebhook = defineWebhookUseCase({
  name: 'createWebhook',
  input: webhookEndpointInputSchema,
  permission: 'webhook:manage',
  audit: {
    action: 'webhook.saved',
    target: (_input, result: CreatedWebhook) => ({ type: 'webhook_endpoint', id: result.endpoint.id }),
    metadata: (_input, result: CreatedWebhook) => ({ events: result.endpoint.events, enabled: result.endpoint.enabled }),
  },
  handler: async ({ deps, actor, input }): Promise<CreatedWebhook> => {
    assertUrl(deps, input.url);
    const secret = deps.newSecret();
    const endpoint = await deps.endpoints.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      url: input.url,
      secret,
      events: input.events,
      enabled: input.enabled,
      createdAt: deps.now(),
    });
    return { endpoint, secret };
  },
});

/** The secret is never changed here: to rotate it, delete the endpoint and create a new one. */
export const updateWebhook = defineWebhookUseCase({
  name: 'updateWebhook',
  input: webhookEndpointInputSchema.extend({ endpointId: z.string().min(1) }),
  permission: 'webhook:manage',
  audit: {
    action: 'webhook.saved',
    target: (_input, endpoint: WebhookEndpoint) => ({ type: 'webhook_endpoint', id: endpoint.id }),
    metadata: (_input, endpoint: WebhookEndpoint) => ({ events: endpoint.events, enabled: endpoint.enabled }),
  },
  handler: async ({ deps, actor, input }): Promise<WebhookEndpoint> => {
    const endpoint = await requireEndpoint(deps, actor.organizationId, input.endpointId);
    assertUrl(deps, input.url);
    return deps.endpoints.save({ ...endpoint, url: input.url, events: input.events, enabled: input.enabled });
  },
});

export const deleteWebhook = defineWebhookUseCase({
  name: 'deleteWebhook',
  input: z.object({ endpointId: z.string().min(1) }),
  permission: 'webhook:manage',
  audit: { action: 'webhook.deleted', target: (_input, endpoint: WebhookEndpoint) => ({ type: 'webhook_endpoint', id: endpoint.id }) },
  handler: async ({ deps, actor, input }): Promise<WebhookEndpoint> => {
    const endpoint = await requireEndpoint(deps, actor.organizationId, input.endpointId);
    await deps.endpoints.delete(actor.organizationId, endpoint.id);
    return endpoint;
  },
});

/** Sends a `ping` event to this endpoint only (not through the subscription list), already marked as published. */
export const testWebhook = defineWebhookUseCase({
  name: 'testWebhook',
  input: z.object({ endpointId: z.string().min(1) }),
  permission: 'webhook:manage',
  audit: { skip: 'the delivery log records the ping' },
  handler: async ({ deps, actor, input }): Promise<{ readonly eventId: string }> => {
    const endpoint = await requireEndpoint(deps, actor.organizationId, input.endpointId);
    const now = deps.now();
    const event = await deps.outbox.append({
      id: deps.newId(),
      organizationId: actor.organizationId,
      type: 'ping',
      data: {},
      occurredAt: now,
      publishedAt: now,
    });
    await deps.queue.enqueue('webhook.deliver', { organizationId: actor.organizationId, eventId: event.id, endpointId: endpoint.id });
    return { eventId: event.id };
  },
});

export const listWebhookDeliveries = defineWebhookUseCase({
  name: 'listWebhookDeliveries',
  input: z.object({ endpointId: z.string().min(1) }),
  permission: 'webhook:manage',
  audit: { skip: 'read of the delivery log: ids, status codes and short error codes only' },
  handler: async ({ deps, actor, input }): Promise<readonly WebhookDelivery[]> => {
    const endpoint = await requireEndpoint(deps, actor.organizationId, input.endpointId);
    return deps.deliveries.listByEndpoint(actor.organizationId, endpoint.id, DELIVERY_LOG_LIMIT);
  },
});
