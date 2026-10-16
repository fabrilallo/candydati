import type { AuditAction, AuditEvent, NewAuditEvent } from '@candydati/domain';
import type { JobTeamRepository } from './job-team-ports.js';
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
  /**
   * Job teams: what per-job access is resolved from (PRODUCT.md §6). Needed whenever a job-scoped actor (recruiter,
   * hiring manager, interviewer) runs a use case that touches candidate or job data; without it that run fails closed.
   */
  readonly jobTeams?: JobTeamRepository | undefined;
}
