import { ROLES, ROLE_GRANTS, STATEMENTS, type Role } from '@tt/domain';
import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Better Auth access control derived entirely from the domain model: resources and actions from STATEMENTS,
 * one role per entry of ROLES with the grants of ROLE_GRANTS. Nothing about roles is declared in the api.
 */
export function buildAccessControl() {
  const ac = createAccessControl(STATEMENTS);
  const roles = Object.fromEntries(
    ROLES.map((role) => [role, ac.newRole(ROLE_GRANTS[role] as Parameters<typeof ac.newRole>[0])]),
  ) as Record<Role, ReturnType<typeof ac.newRole>>;
  return { ac, roles };
}
