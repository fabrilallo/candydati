import type { ActorType } from '../audit/events.js';
import { PERMISSIONS, permissionsOf, type Permission, type Role } from './permissions.js';

/**
 * Never grantable to an API key or to the agent, whatever the role of the person behind it: decisions on people,
 * messages to candidates and administration stay with a person (PLAN §6). `authorize` checks this list on every call,
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
    ].includes(permission),
);

/** The internal agent also cannot move a candidate: that is a decision about them. */
export const AGENT_EXTRA_FORBIDDEN: readonly Permission[] = ['candidate:move'];

/** Permissions an actor type can never use, whatever the role. Users and the system have no such list. */
export function forbiddenPermissions(actorType: ActorType): readonly Permission[] {
  if (actorType === 'api_key') return MACHINE_FORBIDDEN_PERMISSIONS;
  if (actorType === 'agent') return [...MACHINE_FORBIDDEN_PERMISSIONS, ...AGENT_EXTRA_FORBIDDEN];
  return [];
}

export const isForbiddenFor = (actorType: ActorType, permission: Permission): boolean =>
  forbiddenPermissions(actorType).includes(permission);

/** What can be handed to an actor of this type acting with this role: the role's permissions minus the forbidden list. */
export function grantablePermissions(role: Role, actorType: ActorType): readonly Permission[] {
  const forbidden = forbiddenPermissions(actorType);
  return permissionsOf(role).filter((permission) => !forbidden.includes(permission));
}
