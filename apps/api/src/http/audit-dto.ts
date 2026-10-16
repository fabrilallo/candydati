import type { AuditEvent } from '@candydati/domain';

export interface AuditEventDto {
  readonly id: string;
  readonly organizationId: string;
  readonly actor: {
    readonly type: AuditEvent['actor']['type'];
    readonly id: string | null;
    readonly onBehalfOfUserId: string | null;
    readonly name: string | null;
  };
  readonly action: AuditEvent['action'];
  readonly target: { readonly type: string; readonly id: string };
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

/** Display names by user id, for one page of events. */
export type UserNames = ReadonlyMap<string, string>;

/** Ids worth resolving: only actors that are people, without duplicates. */
export const userActorIds = (events: readonly AuditEvent[]): readonly string[] => [
  ...new Set(events.flatMap((event) => (event.actor.type === 'user' && event.actor.id ? [event.actor.id] : []))),
];

export const toAuditEventDto = (event: AuditEvent, names: UserNames): AuditEventDto => ({
  id: event.id,
  organizationId: event.organizationId,
  actor: {
    type: event.actor.type,
    id: event.actor.id,
    onBehalfOfUserId: event.actor.onBehalfOfUserId,
    name: event.actor.type === 'user' && event.actor.id ? (names.get(event.actor.id) ?? null) : null,
  },
  action: event.action,
  target: { type: event.target.type, id: event.target.id },
  metadata: event.metadata,
  occurredAt: event.occurredAt.toISOString(),
});
