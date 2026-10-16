import { AUDIT_ACTIONS, auditTargetSchema, type AuditAction, type AuditTarget } from '@candydati/domain';
import { z } from 'zod';
import { defineUseCase } from '../use-case.js';

/** Actions of mutations performed by Better Auth itself; `audit.read` is only written by the log reader. */
export const RECORDABLE_ACTIONS = AUDIT_ACTIONS.filter((action) => action !== 'audit.read') as unknown as readonly [
  Exclude<AuditAction, 'audit.read'>,
  ...Exclude<AuditAction, 'audit.read'>[],
];

const inputSchema = z.object({
  organizationId: z.string().min(1),
  action: z.enum(RECORDABLE_ACTIONS),
  target: auditTargetSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export interface RecordedEvent {
  readonly action: AuditAction;
  readonly target: AuditTarget;
}

/**
 * Records a mutation that Better Auth already authorized and performed (organization created, invitation
 * accepted, member role changed...). The actor is always the caller, never taken from the input, and the
 * organization must be the caller's own. No permission is checked here: e.g. an invitee accepting an invitation
 * holds no administrative permission.
 */
export const recordAuditEvent = defineUseCase({
  name: 'recordAuditEvent',
  input: inputSchema,
  permission: { skip: 'the mutation was authorized by Better Auth; organization scope is still enforced' },
  organizationOf: (input) => input.organizationId,
  audit: {
    action: (input) => input.action,
    target: (input) => input.target,
    metadata: (input) => input.metadata,
  },
  handler: async ({ input }): Promise<RecordedEvent> => ({ action: input.action, target: input.target }),
});
