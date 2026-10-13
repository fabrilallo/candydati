import type { AuditAction, AuditEvent, NewAuditEvent } from '@tt/domain';
import type { TransactionalDeps } from './transaction.js';

export interface AuditLogQuery {
  readonly organizationId: string;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
  readonly action?: AuditAction | undefined;
}

export interface AuditLogPage {
  readonly items: readonly AuditEvent[];
  /** Matching events across all pages. */
  readonly total: number;
}

/** Append-only: there is deliberately no update or delete. */
export interface AuditLogRepository {
  append(event: NewAuditEvent): Promise<AuditEvent>;
  /** Newest first. */
  list(query: AuditLogQuery): Promise<AuditLogPage>;
}

/** Every use case can open a unit of work: its writes, the audit event and the outbox events commit together. */
export interface CoreDeps extends TransactionalDeps {
  readonly auditLog: AuditLogRepository;
}
