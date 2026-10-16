import { randomUUID } from 'node:crypto';
import { newAuditEventSchema, type AuditEvent, type NewAuditEvent } from '@candydati/domain';
import type { AuditLogPage, AuditLogQuery, AuditLogRepository } from '../ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryAuditLog extends AuditLogRepository {
  /** Snapshot of everything stored, oldest first. */
  events(): readonly AuditEvent[];
}

interface Options {
  readonly failAppendWith?: unknown;
}

function build(options: Options): InMemoryAuditLog {
  const stored = cell<readonly AuditEvent[]>([]);
  let sequence = 0;
  return {
    async append(event: NewAuditEvent): Promise<AuditEvent> {
      if ('failAppendWith' in options) throw options.failAppendWith;
      sequence += 1;
      const parsed = newAuditEventSchema.parse(event);
      // Strictly increasing dates so "newest first" is deterministic within one millisecond.
      const created: AuditEvent = { ...parsed, id: randomUUID(), occurredAt: new Date(Date.now() + sequence / 1000) };
      stored.set([...stored.get(), created]);
      return created;
    },
    async list(query: AuditLogQuery): Promise<AuditLogPage> {
      const matching = stored.get()
        .filter((e) => e.organizationId === query.organizationId)
        .filter((e) => query.action === undefined || e.action === query.action)
        .toReversed();
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    events: () => [...stored.get()],
  };
}

export const createInMemoryAuditLog = (): InMemoryAuditLog => build({});

/** An audit log whose `append` always rejects with `error`. */
export const failingAuditLog = (error: unknown): InMemoryAuditLog => build({ failAppendWith: error });
