import type { OutboxEvent } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { OutboxRepository, OutboxRetryState, PendingOutboxEvent } from '../webhook-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryOutbox extends OutboxRepository {
  snapshot(): readonly OutboxEvent[];
  purge(doomed: (event: OutboxEvent) => boolean): void;
}

const FRESH: OutboxRetryState = { attempts: 0, lastError: null, nextAttemptAt: null, deadAt: null };

const strip = ({ attempts: _a, lastError: _l, nextAttemptAt: _n, deadAt: _d, ...event }: PendingOutboxEvent): OutboxEvent => event;

const isDue = (event: PendingOutboxEvent, now: Date): boolean =>
  event.publishedAt === null && event.deadAt === null && (event.nextAttemptAt === null || event.nextAttemptAt <= now);

/** The outbox in memory, with the retry state of each event like the Postgres columns. */
export function createInMemoryOutbox(initial: readonly OutboxEvent[] = []): InMemoryOutbox {
  const rows = cell<readonly PendingOutboxEvent[]>(initial.map((event) => ({ ...event, ...FRESH })));
  const same = (event: PendingOutboxEvent, organizationId: string, id: string) => event.organizationId === organizationId && event.id === id;
  const update = (organizationId: string, id: string, change: Partial<PendingOutboxEvent>) =>
    rows.set(rows.get().map((e) => (same(e, organizationId, id) ? { ...e, ...change } : e)));
  return {
    async append(event) {
      if (rows.get().some((e) => same(e, event.organizationId, event.id))) throw new ConflictError('Event already stored.');
      rows.set([...rows.get(), { ...event, ...FRESH }]);
      return event;
    },
    async findById(organizationId, id) {
      const found = rows.get().find((e) => same(e, organizationId, id));
      return found ? strip(found) : null;
    },
    async findWithAttempts(organizationId, id) {
      return rows.get().find((e) => same(e, organizationId, id)) ?? null;
    },
    async listUnpublished(limit, now) {
      return rows.get().filter((e) => isDue(e, now)).slice(0, limit);
    },
    async markPublished(organizationId, id, at) {
      update(organizationId, id, { publishedAt: at });
    },
    async recordFailure(organizationId, id, state) {
      update(organizationId, id, state);
    },
    async prune(before) {
      const kept = rows.get().filter((e) => !((e.publishedAt !== null && e.publishedAt < before) || (e.deadAt !== null && e.deadAt < before)));
      const removed = rows.get().length - kept.length;
      rows.set(kept);
      return removed;
    },
    snapshot: () => rows.get().map(strip),
    purge(doomed) {
      rows.set(rows.get().filter((e) => !doomed(strip(e))));
    },
  };
}
