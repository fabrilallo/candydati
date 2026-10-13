import { canAssignRole, DEFAULT_INVITE_ROLE, isRole, roleHasPermission, ROLES, type Permission, type Role } from '@tt/domain'

/** Better Auth stores roles as a comma-separated string; the most powerful (first in `ROLES`) wins. */
export const parseMemberRole = (raw: unknown): Role | null => {
  if (typeof raw !== 'string') return null
  const held = raw.split(',').map((part) => part.trim()).filter(isRole)
  return ROLES.find((role) => held.includes(role)) ?? null
}

export const can = (role: Role | null, permission: Permission): boolean => role !== null && roleHasPermission(role, permission)

export const assignableRoles = (actorRole: Role | null): readonly Role[] =>
  actorRole === null ? [] : ROLES.filter((target) => canAssignRole(actorRole, target))

export const defaultInviteRole = (actorRole: Role | null): Role | null => {
  const allowed = assignableRoles(actorRole)
  if (allowed.includes(DEFAULT_INVITE_ROLE)) return DEFAULT_INVITE_ROLE
  return allowed[0] ?? null
}

export interface NavItem {
  readonly id: 'dashboard' | 'jobs' | 'members' | 'audit'
  readonly to: string
  readonly permission?: Permission
}

const NAV: readonly NavItem[] = [
  { id: 'dashboard', to: '/app' },
  { id: 'jobs', to: '/app/jobs', permission: 'job:read' },
  { id: 'members', to: '/app/settings/members' },
  { id: 'audit', to: '/app/settings/audit-log', permission: 'audit:read' },
]

export const visibleNav = (role: Role | null): readonly NavItem[] => NAV.filter((item) => item.permission === undefined || can(role, item.permission))
