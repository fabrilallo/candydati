import {
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_TIMEOUT_MS,
  type DeliveredEventType,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEventPayload,
} from '@tt/domain';
import { z } from 'zod';
import { defineUseCase } from '../../use-case.js';
import type { WebhookDeliverDeps } from '../../webhook-ports.js';
import { webhookHeaders } from './signature.js';

export type WebhookDeliveryResult = 'delivered' | 'failed' | 'skipped';

const inputSchema = z.object({
  organizationId: z.string().min(1),
  eventId: z.string().min(1),
  endpointId: z.string().min(1),
  /** 1-based attempt number, from the queue's retry count. */
  attempt: z.number().int().min(1).default(1),
  /** The worker passes false while retries remain: a failed attempt is then rethrown so the queue retries it. */
  lastAttempt: z.boolean().default(true),
});

export class WebhookDeliveryError extends Error {
  constructor(readonly code: string) {
    super(`Webhook delivery failed: ${code}`);
    this.name = 'WebhookDeliveryError';
  }
}

const subscribes = (endpoint: WebhookEndpoint, type: DeliveredEventType): boolean =>
  type === 'ping' || (endpoint.events as readonly string[]).includes(type);

async function log(deps: WebhookDeliverDeps, row: Omit<WebhookDelivery, 'id' | 'createdAt'>): Promise<void> {
  await deps.deliveries.append({ ...row, id: deps.newId(), createdAt: deps.now() });
}

/**
 * Worker use case (system actor, task `webhook.deliver`). One attempt: checks the host with the injected `HostGuard`
 * (SSRF), POSTs the signed JSON with the injected `HttpPoster` (10 s timeout, no redirects) and logs the attempt. A 2xx is
 * delivered. A blocked host fails for good; any other failure is rethrown while retries remain (`lastAttempt: false`,
 * up to 5 attempts) and logged as `failed` on the last one. The log has status codes and short error codes, never bodies.
 */
export const deliverWebhook = defineUseCase<WebhookDeliverDeps, typeof inputSchema, WebhookDeliveryResult>({
  name: 'deliverWebhook',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued by publishWebhookEvents and testWebhook; the organization scope still applies' },
  audit: { skip: 'the delivery log is the record' },
  handler: async ({ deps, input }): Promise<WebhookDeliveryResult> => {
    const { organizationId } = input;
    const [endpoint, event] = await Promise.all([
      deps.endpoints.findById(organizationId, input.endpointId),
      deps.outbox.findById(organizationId, input.eventId),
    ]);
    if (!endpoint || !event || !endpoint.enabled || !subscribes(endpoint, event.type)) return 'skipped';
    const base = { organizationId, endpointId: endpoint.id, eventId: event.id, eventType: event.type, attempt: input.attempt };
    if (!(await deps.hostGuard.isAllowed(endpoint.url))) {
      await log(deps, { ...base, status: 'failed', responseCode: null, error: 'host_blocked' });
      return 'failed';
    }
    const payload: WebhookEventPayload = {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      organizationId,
      data: event.data,
    };
    const body = JSON.stringify(payload);
    const result = await deps.poster
      .post({ url: endpoint.url, headers: webhookHeaders(endpoint.secret, payload, deps.newId(), deps.now(), body), body, timeoutMs: WEBHOOK_TIMEOUT_MS })
      .catch((): { readonly ok: false; readonly error: 'network_error' } => ({ ok: false, error: 'network_error' }));
    if (result.ok && result.status >= 200 && result.status < 300) {
      await log(deps, { ...base, status: 'success', responseCode: result.status, error: null });
      return 'delivered';
    }
    const error = result.ok ? 'http_error' : result.error;
    await log(deps, { ...base, status: 'failed', responseCode: result.ok ? result.status : null, error });
    if (!input.lastAttempt && input.attempt < WEBHOOK_MAX_ATTEMPTS) throw new WebhookDeliveryError(error);
    return 'failed';
  },
});
