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

export type NavId = 'dashboard' | 'attention' | 'tasks' | 'jobs' | 'candidates' | 'imports' | 'templates' | 'members' | 'privacy' | 'email' | 'emailTemplates' | 'webhooks' | 'distribution' | 'api' | 'data' | 'audit'
export type NavSectionId = 'work' | 'organization'

export interface NavItem {
  readonly id: NavId
  readonly to: string
  readonly section: NavSectionId
  readonly permission?: Permission
}

const NAV: readonly NavItem[] = [
  { id: 'dashboard', to: '/app', section: 'work' },
  { id: 'attention', to: '/app/attention', section: 'work', permission: 'candidate:read' },
  { id: 'tasks', to: '/app/tasks', section: 'work', permission: 'task:read' },
  { id: 'jobs', to: '/app/jobs', section: 'work', permission: 'job:read' },
  { id: 'candidates', to: '/app/candidates', section: 'work', permission: 'candidate:read' },
  { id: 'imports', to: '/app/imports', section: 'work', permission: 'import:manage' },
  { id: 'templates', to: '/app/jobs/templates', section: 'work', permission: 'job_template:read' },
  { id: 'members', to: '/app/settings/members', section: 'organization' },
  { id: 'privacy', to: '/app/settings/privacy', section: 'organization', permission: 'privacy:manage' },
  { id: 'email', to: '/app/settings/email', section: 'organization', permission: 'email_settings:manage' },
  { id: 'emailTemplates', to: '/app/settings/email-templates', section: 'organization', permission: 'email_template:manage' },
  { id: 'webhooks', to: '/app/settings/webhooks', section: 'organization', permission: 'webhook:manage' },
  { id: 'distribution', to: '/app/settings/distribution', section: 'organization', permission: 'job:publish' },
  { id: 'api', to: '/app/settings/api', section: 'organization', permission: 'api_key:manage' },
  { id: 'data', to: '/app/settings/data', section: 'organization', permission: 'data:export' },
  { id: 'audit', to: '/app/settings/audit-log', section: 'organization', permission: 'audit:read' },
]

export const visibleNav = (role: Role | null): readonly NavItem[] => NAV.filter((item) => item.permission === undefined || can(role, item.permission))

export interface NavSection {
  readonly id: NavSectionId
  readonly items: readonly NavItem[]
}

/** The visible items grouped by section, in order; empty sections are left out. */
export const navSections = (role: Role | null): readonly NavSection[] => {
  const items = visibleNav(role)
  return (['work', 'organization'] as const)
    .map((id) => ({ id, items: items.filter((item) => item.section === id) }))
    .filter((section) => section.items.length > 0)
}

/** Most specific match wins: `/app/jobs/templates` is the templates entry, not the jobs one. */
export const activeNavId = (path: string, items: readonly NavItem[]): NavId | null => {
  const matching = items.filter((item) => (item.to === '/app' ? path === '/app' : path === item.to || path.startsWith(`${item.to}/`)))
  return matching.toSorted((a, b) => b.to.length - a.to.length)[0]?.id ?? null
}
