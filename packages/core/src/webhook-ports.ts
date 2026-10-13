import type { OutboxEvent, WebhookDelivery, WebhookEndpoint, WebhookEventType } from '@tt/domain';
import type { TaskQueue } from './intake-ports.js';
import type { CoreDeps } from './ports.js';
import type { TransactionalDeps } from './transaction.js';

/** Events are appended in the same transaction as the change; a worker publishes them. */
export interface OutboxRepository {
  append(event: OutboxEvent): Promise<OutboxEvent>;
  findById(organizationId: string, id: string): Promise<OutboxEvent | null>;
  /**
   * Oldest first, across organizations: only for the system job that publishes. Inside a transaction the rows are
   * claimed (`FOR UPDATE SKIP LOCKED`): a second publisher running at the same time skips them instead of fanning them
   * out again.
   */
  listUnpublished(limit: number): Promise<readonly OutboxEvent[]>;
  markPublished(organizationId: string, id: string, at: Date): Promise<void>;
}

export interface WebhookEndpointRepository {
  create(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>;
  /** Full replace by (organizationId, id). */
  save(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>;
  findById(organizationId: string, id: string): Promise<WebhookEndpoint | null>;
  /** Newest first. */
  list(organizationId: string): Promise<readonly WebhookEndpoint[]>;
  /** Enabled endpoints subscribed to `type`. */
  listForEvent(organizationId: string, type: WebhookEventType): Promise<readonly WebhookEndpoint[]>;
  /** True when an endpoint was deleted (its deliveries go with it). */
  delete(organizationId: string, id: string): Promise<boolean>;
}

export interface WebhookDeliveryRepository {
  append(delivery: WebhookDelivery): Promise<WebhookDelivery>;
  /** True when this event already reached this endpoint (a 2xx was logged): a repeated task does not post it again. */
  hasSucceeded(organizationId: string, endpointId: string, eventId: string): Promise<boolean>;
  /** Newest first. */
  listByEndpoint(organizationId: string, endpointId: string, limit: number): Promise<readonly WebhookDelivery[]>;
}

export interface HttpPostRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
}

/** `status` is whatever the server answered. Redirects are NOT followed: a 3xx comes back as is. */
export type HttpPostResult = { readonly ok: true; readonly status: number } | { readonly ok: false; readonly error: 'timeout' | 'network_error' };

/** The HTTP client of the worker. Implemented outside core (it owns timeouts and the no-redirect rule). */
export interface HttpPoster {
  post(request: HttpPostRequest): Promise<HttpPostResult>;
}

/**
 * SSRF check, implemented in the api/worker adapter: resolves the host and refuses private, loopback, link-local and
 * metadata addresses (unless `WEBHOOKS_ALLOW_PRIVATE=true`). Core asks before every delivery.
 */
export interface HostGuard {
  isAllowed(url: string): Promise<boolean>;
}

export interface WebhookDeps extends CoreDeps {
  readonly endpoints: WebhookEndpointRepository;
  readonly deliveries: WebhookDeliveryRepository;
  readonly outbox: OutboxRepository;
  readonly queue: TaskQueue;
  /** `WEBHOOKS_ALLOW_PRIVATE`: lets `http://localhost` URLs through. */
  readonly allowPrivateWebhooks: boolean;
  /** A new signing secret from a CSPRNG (`whsec_...`). Randomness lives in deps, never in core. */
  readonly newSecret: () => string;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface WebhookPublishDeps extends TransactionalDeps {
  readonly endpoints: WebhookEndpointRepository;
  readonly outbox: OutboxRepository;
  readonly queue: TaskQueue;
  readonly now: () => Date;
}

export interface WebhookDeliverDeps extends CoreDeps {
  readonly endpoints: WebhookEndpointRepository;
  readonly deliveries: WebhookDeliveryRepository;
  readonly outbox: OutboxRepository;
  readonly poster: HttpPoster;
  readonly hostGuard: HostGuard;
  readonly newId: () => string;
  readonly now: () => Date;
}
