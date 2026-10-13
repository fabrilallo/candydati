import { z } from 'zod';

/** The WHATWG `URL` exists in browsers and in Node; this package only types the part it uses (no DOM or Node libs). */
interface ParsedUrl {
  readonly protocol: string;
  readonly hostname: string;
  readonly username: string;
  readonly password: string;
}
declare const URL: new (input: string) => ParsedUrl;

export const WEBHOOK_EVENT_TYPES = [
  'application.received',
  'application.moved',
  'application.decided',
  'candidate.erased',
  'job.published',
  /** A published ad was edited: what readers see changed. */
  'job.updated',
  'job.closed',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
/** `ping` is only ever sent by the "test" action. */
export type DeliveredEventType = WebhookEventType | 'ping';

export const WEBHOOK_URL_MAX = 2000;
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_TIMEOUT_MS = 10_000;

export const webhookEndpointInputSchema = z.object({
  url: z.string().trim().max(WEBHOOK_URL_MAX),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1)
    .transform((events) => [...new Set(events)]),
  enabled: z.boolean().default(true),
});
export type WebhookEndpointInput = z.input<typeof webhookEndpointInputSchema>;

export type WebhookUrlIssue = 'invalid_url' | 'https_required' | 'credentials_not_allowed';

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * URL rules: https only. `http://localhost` (and loopback) is accepted only when `allowPrivate` is on
 * (`WEBHOOKS_ALLOW_PRIVATE=true`, development). No credentials in the URL. Resolving the host and refusing private
 * addresses happens at delivery time, in the `HostGuard` the worker injects; this check is only about the text.
 * Returns the issue, or null when the URL is acceptable.
 */
export function checkWebhookUrl(raw: string, allowPrivate: boolean): WebhookUrlIssue | null {
  let url: ParsedUrl;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid_url';
  }
  if (url.username !== '' || url.password !== '') return 'credentials_not_allowed';
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && allowPrivate && LOCALHOST_NAMES.has(url.hostname)) return null;
  return url.protocol === 'http:' ? 'https_required' : 'invalid_url';
}

/** What a consumer receives. `data` carries ids and non-personal fields only: no names, no emails. */
export interface WebhookEventPayload {
  readonly id: string;
  readonly type: DeliveredEventType;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly data: Readonly<Record<string, string | number | boolean | null>>;
}

export const WEBHOOK_HEADERS = {
  event: 'x-tt-event',
  delivery: 'x-tt-delivery',
  signature: 'x-tt-signature',
  timestamp: 'x-tt-timestamp',
} as const;

/** Stored endpoint. `secret` exists only inside the platform: no DTO, log or audit event ever carries it after creation. */
export interface WebhookEndpoint {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly secret: string;
  readonly events: readonly WebhookEventType[];
  readonly enabled: boolean;
  readonly createdAt: Date;
}

export type WebhookDeliveryStatus = 'success' | 'failed';

/** One delivery attempt. */
export interface WebhookDelivery {
  readonly id: string;
  readonly organizationId: string;
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventType: DeliveredEventType;
  readonly status: WebhookDeliveryStatus;
  readonly responseCode: number | null;
  readonly attempt: number;
  /** A short code (`timeout`, `host_blocked`, `http_error`, `network_error`), never the response body. */
  readonly error: string | null;
  readonly createdAt: Date;
}

/** An event written with the change that caused it and published later by a worker. */
export interface OutboxEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly type: DeliveredEventType;
  readonly data: WebhookEventPayload['data'];
  readonly occurredAt: Date;
  readonly publishedAt: Date | null;
}
