import { z } from 'zod';

/** Every action recorded in the audit log. Past tense, `<resource>.<what happened>`. */
export const AUDIT_ACTIONS = [
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'invitation.created',
  'invitation.accepted',
  'invitation.rejected',
  'invitation.cancelled',
  'member.added',
  'member.role_changed',
  'member.removed',
  'audit.read',
  'job.created',
  'job.updated',
  'job.published',
  'job.closed',
  'job_template.created',
  'job_template.deleted',
  'privacy_notice.published',
  'application.received',
  'application.moved',
  'application.decided',
  'candidate.viewed',
  'candidate.updated',
  'candidate.cv_downloaded',
  'candidate_note.created',
  'message.sent',
  'message.received',
  'message.failed',
  'email_template.saved',
  'email_template.deleted',
  'email_settings.updated',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Who did it. Agent and API-key actions stay distinguishable from human ones (PLAN §6). */
export const ACTOR_TYPES = ['user', 'agent', 'api_key', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const auditActorSchema = z.object({
  type: z.enum(ACTOR_TYPES),
  /** User id, agent name, API key id; null only for `system`. */
  id: z.string().min(1).nullable(),
  /** The user an agent or API key acts for. */
  onBehalfOfUserId: z.string().min(1).nullable().default(null),
});
export type AuditActor = z.infer<typeof auditActorSchema>;

export const auditTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});
export type AuditTarget = z.infer<typeof auditTargetSchema>;

/** What a service hands to the audit log. `id` and `occurredAt` are assigned when it is stored. */
export const newAuditEventSchema = z.object({
  organizationId: z.string().min(1),
  actor: auditActorSchema,
  action: z.enum(AUDIT_ACTIONS),
  target: auditTargetSchema,
  /** Small, non-sensitive context (e.g. `{ role: 'recruiter' }`). Never candidate data or secrets. */
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type NewAuditEvent = z.input<typeof newAuditEventSchema>;

export const auditEventSchema = newAuditEventSchema.extend({
  id: z.string().min(1),
  occurredAt: z.date(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
