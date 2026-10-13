import { createHmac } from 'node:crypto';
import { WEBHOOK_HEADERS, type WebhookEventPayload } from '@tt/domain';

/** `sha256=<hex HMAC-SHA256 of "<timestamp>.<body>">`, keyed with the endpoint secret. The timestamp is in the header too. */
export const signWebhook = (secret: string, timestamp: string, body: string): string =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

/** Headers of one delivery: event type, delivery id, timestamp (unix seconds) and signature. */
export function webhookHeaders(
  secret: string,
  payload: WebhookEventPayload,
  deliveryId: string,
  now: Date,
  body: string,
): Readonly<Record<string, string>> {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    'content-type': 'application/json',
    [WEBHOOK_HEADERS.event]: payload.type,
    [WEBHOOK_HEADERS.delivery]: deliveryId,
    [WEBHOOK_HEADERS.timestamp]: timestamp,
    [WEBHOOK_HEADERS.signature]: signWebhook(secret, timestamp, body),
  };
}
