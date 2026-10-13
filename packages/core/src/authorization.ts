import { roleHasPermission, type Permission } from '@tt/domain';
import type { Actor } from './actor.js';
import { ForbiddenError } from './errors.js';

export const can = (actor: Actor, permission: Permission): boolean => roleHasPermission(actor.role, permission);

/** Cross-organization access is always forbidden, whatever the role. */
export function assertSameOrganization(actor: Actor, resourceOrganizationId: string): void {
  if (actor.organizationId !== resourceOrganizationId) throw new ForbiddenError();
}

export function authorize(actor: Actor, permission: Permission, resourceOrganizationId?: string): void {
  if (resourceOrganizationId !== undefined) assertSameOrganization(actor, resourceOrganizationId);
  if (!can(actor, permission)) throw new ForbiddenError();
}
