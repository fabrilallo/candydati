import { ACTOR_TYPES, AUDIT_ACTIONS } from '@tt/domain';
import { z } from 'zod';

/** One event of the append-only audit log, as `GET /audit-log` returns it (`AuditEventDto` of the api). */
export const auditEventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  actor: z.object({
    type: z.enum(ACTOR_TYPES).describe('Who acted: a person, an API key, the assistant or the system.'),
    id: z.string().nullable(),
    onBehalfOfUserId: z.string().nullable(),
    name: z.string().nullable().describe('Display name, only for people.'),
  }),
  action: z.enum(AUDIT_ACTIONS),
  target: z.object({ type: z.string(), id: z.string() }),
  metadata: z.record(z.string(), z.unknown()),
  occurredAt: z.iso.datetime(),
});

export const confirmNameBody = z.object({ confirmName: z.string().describe('The full name of the person, typed to confirm the erasure.') });
export const deletedResult = z.object({ deleted: z.literal(true) });
