import { isForbiddenFor, roleHasPermission, type Permission } from '@candydati/domain';
import type { Actor } from './actor.js';
import { ForbiddenError } from './errors.js';

/**
 * The role allows it, the scopes (when the actor has any) allow it, and it is not on the forbidden list of the actor
 * type (api_key and agent). The forbidden list is checked here, not only when scopes are issued: a key whose scopes were
 * wrong in the database still cannot decide on a candidate or send a message.
 */
export const can = (actor: Actor, permission: Permission): boolean =>
  roleHasPermission(actor.role, permission) &&
  (actor.scopes === undefined || actor.scopes === null || actor.scopes.includes(permission)) &&
  !isForbiddenFor(actor.type, permission);

/** Cross-organization access is always forbidden, whatever the role. */
export function assertSameOrganization(actor: Actor, resourceOrganizationId: string): void {
  if (actor.organizationId !== resourceOrganizationId) throw new ForbiddenError();
}

export function authorize(actor: Actor, permission: Permission, resourceOrganizationId?: string): void {
  if (resourceOrganizationId !== undefined) assertSameOrganization(actor, resourceOrganizationId);
  if (!can(actor, permission)) throw new ForbiddenError();
}
