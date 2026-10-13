import type { OutboxEvent, WebhookEventType } from '@tt/domain';
import type { OutboxRepository } from '../../webhook-ports.js';

export type EventData = OutboxEvent['data'];

/**
 * Appends an event to the outbox. `data` is ids and non-personal fields only: no names, no emails, no free text of
 * candidates; a consumer reads the details through the API. Call it with the repositories of the same transaction as the
 * change, so an event exists if and only if the change does.
 */
export async function recordEvent(
  deps: { readonly outbox: OutboxRepository; readonly newId: () => string; readonly now: () => Date },
  organizationId: string,
  type: WebhookEventType,
  data: EventData,
): Promise<OutboxEvent> {
  return deps.outbox.append({ id: deps.newId(), organizationId, type, data, occurredAt: deps.now(), publishedAt: null });
}
