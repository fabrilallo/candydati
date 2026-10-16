import { AUDIT_ACTIONS } from '@candydati/domain'

/** Event as the API returns it (`AuditEventDto`); `action` and `actor.type` stay open so a newer api never breaks the page. */
export interface AuditEventView {
  readonly id: string
  readonly organizationId: string
  readonly actor: { readonly type: string; readonly id: string | null; readonly onBehalfOfUserId: string | null; readonly name: string | null }
  readonly action: string
  readonly target: { readonly type: string; readonly id: string }
  readonly metadata: Readonly<Record<string, unknown>>
  readonly occurredAt: string
}

export type ActorKind = 'user' | 'agent' | 'api_key' | 'system'

const isKnownAction = (action: string): boolean => (AUDIT_ACTIONS as readonly string[]).includes(action)

export const actionLabelKey = (action: string): string => (isKnownAction(action) ? `audit.actions.${action}` : 'audit.actions.unknown')

export const actorKind = (actor: AuditEventView['actor']): ActorKind => (actor.type === 'agent' || actor.type === 'api_key' || actor.type === 'system' ? actor.type : 'user')

const DETAIL_KEYS = ['email', 'role', 'previousRole', 'name'] as const

export interface AuditDetail {
  readonly key: (typeof DETAIL_KEYS)[number]
  readonly value: string
}

/** Pure: the few non-sensitive metadata fields worth showing next to an event. Nested values are dropped. */
export const auditDetails = (event: AuditEventView): readonly AuditDetail[] =>
  DETAIL_KEYS.flatMap((key) => {
    const value = event.metadata[key]
    return typeof value === 'string' && value.length > 0 ? [{ key, value }] : []
  })

const ID_PREVIEW = 8

export const targetLabel = (target: AuditEventView['target']): { type: string; id: string } => ({
  type: target.type,
  id: target.id.length > ID_PREVIEW + 2 ? `${target.id.slice(0, ID_PREVIEW)}…` : target.id,
})
