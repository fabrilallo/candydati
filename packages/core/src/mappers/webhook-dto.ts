import type { DeliveredEventType, WebhookDelivery, WebhookDeliveryStatus, WebhookEndpoint, WebhookEventType } from '@candydati/domain';
import type { CreatedWebhook } from '../use-cases/webhooks/endpoints.js';

/** There is deliberately no `secret` here: no read ever returns it. */
export interface WebhookEndpointDto {
  readonly id: string;
  readonly url: string;
  readonly events: readonly WebhookEventType[];
  readonly enabled: boolean;
  readonly createdAt: string;
}

/** The creation response: the only place the secret appears. Show it once. */
export interface CreatedWebhookDto extends WebhookEndpointDto {
  readonly secret: string;
}

export interface WebhookDeliveryDto {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: DeliveredEventType;
  readonly status: WebhookDeliveryStatus;
  readonly responseCode: number | null;
  readonly attempt: number;
  readonly error: string | null;
  readonly createdAt: string;
}

export const toWebhookEndpointDto = (endpoint: WebhookEndpoint): WebhookEndpointDto => ({
  id: endpoint.id,
  url: endpoint.url,
  events: endpoint.events,
  enabled: endpoint.enabled,
  createdAt: endpoint.createdAt.toISOString(),
});

export const toCreatedWebhookDto = ({ endpoint, secret }: CreatedWebhook): CreatedWebhookDto => ({
  ...toWebhookEndpointDto(endpoint),
  secret,
});

export const toWebhookDeliveryDto = (delivery: WebhookDelivery): WebhookDeliveryDto => ({
  id: delivery.id,
  eventId: delivery.eventId,
  eventType: delivery.eventType,
  status: delivery.status,
  responseCode: delivery.responseCode,
  attempt: delivery.attempt,
  error: delivery.error,
  createdAt: delivery.createdAt.toISOString(),
});
