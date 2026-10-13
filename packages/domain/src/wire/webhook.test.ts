import { describe, expect, it } from 'vitest';
import { webhookCreatedSchema, webhookDeliverySchema, webhookEndpointSchema } from './webhook.js';

const endpoint = { id: 'w1', url: 'https://example.com/hook', events: ['job.published'], enabled: true, createdAt: '2026-05-01T10:00:00.000Z' };

describe('webhook wire schemas', () => {
  it('reads an endpoint without a secret and a created one with it', () => {
    expect(webhookEndpointSchema.parse(endpoint)).toEqual(endpoint);
    expect(webhookCreatedSchema.safeParse(endpoint).success).toBe(false);
    expect(webhookCreatedSchema.parse({ ...endpoint, secret: 'whsec_x' }).secret).toBe('whsec_x');
  });

  it('reads a delivery, the ping included', () => {
    const delivery = { id: 'd1', eventId: 'e1', eventType: 'ping', status: 'failed', responseCode: null, attempt: 1, error: 'timeout', createdAt: '2026-05-01T10:00:00.000Z' };
    expect(webhookDeliverySchema.parse(delivery)).toEqual(delivery);
    expect(webhookDeliverySchema.safeParse({ ...delivery, status: 'pending' }).success).toBe(false);
    expect(webhookDeliverySchema.safeParse({ ...delivery, eventType: undefined }).success).toBe(false);
  });
});
