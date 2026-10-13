import { z } from 'zod';
import { WEBHOOK_EVENT_TYPES } from '../webhook/webhook.js';
import { isoDate } from './common.js';

/** An endpoint as every read returns it: never with the secret. */
export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)),
  enabled: z.boolean(),
  createdAt: isoDate,
});
export type WebhookEndpointDto = z.output<typeof webhookEndpointSchema>;

/** The creation answer: the only one that carries the secret, and only once. */
export const webhookCreatedSchema = webhookEndpointSchema.extend({ secret: z.string().min(1) });
export type WebhookCreatedDto = z.output<typeof webhookCreatedSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  eventType: z.enum([...WEBHOOK_EVENT_TYPES, 'ping']),
  status: z.enum(['success', 'failed']),
  responseCode: z.number().int().nullable(),
  attempt: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: isoDate,
});
export type WebhookDeliveryDto = z.output<typeof webhookDeliverySchema>;
