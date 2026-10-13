import { AUDIT_ACTIONS, type AuditEvent, type PageMeta } from '@tt/domain';
import { z } from 'zod';
import { defineUseCase } from '../use-case.js';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

const inputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  action: z.enum(AUDIT_ACTIONS).optional(),
});

export interface AuditLogPageResult {
  readonly items: readonly AuditEvent[];
  readonly meta: PageMeta;
}

/** Reading is not audited: every page view would otherwise flood the log with `audit.read` events. */
export const listAuditLog = defineUseCase({
  name: 'listAuditLog',
  input: inputSchema,
  permission: 'audit:read',
  audit: { skip: 'read-only; auditing reads of the log would add an event on every page view' },
  handler: async ({ deps, actor, input }): Promise<AuditLogPageResult> => {
    const { items, total } = await deps.auditLog.list({ ...input, organizationId: actor.organizationId });
    return { items, meta: { total, page: input.page, limit: input.limit } };
  },
});
