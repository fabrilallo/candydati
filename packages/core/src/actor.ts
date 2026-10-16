import type { ActorType, AuditActor, Permission, Role } from '@candydati/domain';

interface ActorBase {
  readonly organizationId: string;
  /** Role of the user the actor stands for. An agent or API key never has more than that user. */
  readonly role: Role;
  /**
   * What an API key is limited to, a subset of the role's permissions. Absent or null: the role's full set (users, the
   * system and the agent). The role AND the scopes must allow an action; the forbidden lists of machines still apply.
   */
  readonly scopes?: readonly Permission[] | null;
}

export interface UserActor extends ActorBase {
  readonly type: 'user';
  readonly id: string;
  readonly onBehalfOfUserId: null;
}

export interface DelegatedActor extends ActorBase {
  readonly type: 'agent' | 'api_key';
  /** Agent name or API key id. */
  readonly id: string;
  readonly onBehalfOfUserId: string;
}

export interface SystemActor extends ActorBase {
  readonly type: 'system';
  readonly id: string | null;
  readonly onBehalfOfUserId: null;
}

/** The authenticated principal a use case runs for. */
export type Actor = UserActor | DelegatedActor | SystemActor;

export type { ActorType };

export const toAuditActor = (actor: Actor): AuditActor => ({
  type: actor.type,
  id: actor.id,
  onBehalfOfUserId: actor.onBehalfOfUserId,
});
