import type { ActorType } from '../audit/events.js';
import { PERMISSIONS, permissionsOf, type Permission, type Role } from './permissions.js';

/**
 * Never grantable to an API key or to the agent, whatever the role of the person behind it: decisions on people,
 * messages to candidates and administration stay with a person (PRODUCT.md §5). `authorize` checks this list on every call,
 * so even a key whose scopes were tampered with in the database cannot use these.
 */
export const MACHINE_FORBIDDEN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) =>
    permission.startsWith('member:') ||
    permission.startsWith('invitation:') ||
    [
      'candidate:decide',
      'candidate:erase',
      'message:send',
      'organization:delete',
      'privacy:manage',
      'webhook:manage',
      'email_settings:manage',
      'data:export',
      'api_key:manage',
      'import:manage',
      'job:approve',
      // Who sees which candidates is an access decision: it stays with a person.
      'job_team:manage',
      'restricted_stage:manage',
      // What the organization says publicly about itself, under its name: a person decides it.
      'careers_page:manage',
      // A migration moves a whole history under the operator's responsibility (ADR 0009): a person confirms it.
      'migration:manage',
      // Who receives candidate data outside the organization, and sending it: a person decides (PRODUCT.md §3.5).
      'client:manage',
      'shortlist:send',
      // Which spellings count as one skill in a search is the organization's decision, made by a person.
      'skill_alias:manage',
    ].includes(permission),
);

/** The internal agent and connected apps (MCP clients over OAuth) also cannot move a candidate: that is a decision about them. */
export const AGENT_EXTRA_FORBIDDEN: readonly Permission[] = ['candidate:move'];

/** Permissions an actor type can never use, whatever the role. Users and the system have no such list. */
export function forbiddenPermissions(actorType: ActorType): readonly Permission[] {
  if (actorType === 'api_key') return MACHINE_FORBIDDEN_PERMISSIONS;
  // The agent and a connected app (OAuth, MCP) act for a person but never decide about candidates: no move either.
  if (actorType === 'agent' || actorType === 'connected_app') return [...MACHINE_FORBIDDEN_PERMISSIONS, ...AGENT_EXTRA_FORBIDDEN];
  return [];
}

export const isForbiddenFor = (actorType: ActorType, permission: Permission): boolean =>
  forbiddenPermissions(actorType).includes(permission);

/** What can be handed to an actor of this type acting with this role: the role's permissions minus the forbidden list. */
export function grantablePermissions(role: Role, actorType: ActorType): readonly Permission[] {
  const forbidden = forbiddenPermissions(actorType);
  return permissionsOf(role).filter((permission) => !forbidden.includes(permission));
}
