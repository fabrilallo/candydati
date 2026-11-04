import { canAssignRole, DEFAULT_INVITE_ROLE, isRole, roleHasPermission, ROLES, type Permission, type Role } from '@candydati/domain'

/** Better Auth stores roles as a comma-separated string; the most powerful (first in `ROLES`) wins. */
export const parseMemberRole = (raw: unknown): Role | null => {
  if (typeof raw !== 'string') return null
  const held = raw.split(',').map((part) => part.trim()).filter(isRole)
  return ROLES.find((role) => held.includes(role)) ?? null
}

export const can = (role: Role | null, permission: Permission): boolean => role !== null && roleHasPermission(role, permission)

export const assignableRoles = (actorRole: Role | null): readonly Role[] =>
  actorRole === null ? [] : ROLES.filter((target) => canAssignRole(actorRole, target))

export interface MemberRoleRef {
  readonly userId: string
  readonly role: string
}

/**
 * The roles the actor may give an existing member, or none when the row is not theirs to change: never their own role
 * (no locking oneself out), an owner only by an owner, and never the last owner (the organization keeps one). The api
 * enforces the same rules; this only decides what the screen offers.
 */
export const editableRolesFor = (actorRole: Role | null, actorUserId: string, target: MemberRoleRef, members: readonly MemberRoleRef[]): readonly Role[] => {
  if (!can(actorRole, 'member:update') || target.userId === actorUserId) return []
  if (parseMemberRole(target.role) === 'owner') {
    const owners = members.filter((member) => parseMemberRole(member.role) === 'owner').length
    if (actorRole !== 'owner' || owners <= 1) return []
  }
  return assignableRoles(actorRole)
}

export const defaultInviteRole = (actorRole: Role | null): Role | null => {
  const allowed = assignableRoles(actorRole)
  if (allowed.includes(DEFAULT_INVITE_ROLE)) return DEFAULT_INVITE_ROLE
  return allowed[0] ?? null
}

export type NavId = 'dashboard' | 'attention' | 'tasks' | 'jobs' | 'jobRequests' | 'candidates' | 'reports' | 'imports' | 'templates' | 'members' | 'security' | 'privacy' | 'email' | 'ai' | 'emailTemplates' | 'webhooks' | 'distribution' | 'careersPage' | 'api' | 'data' | 'migrations' | 'audit' | 'clients'
/** Daily work first, then the settings in three groups: what candidates see, what connects outside, the organization itself. */
export type NavSectionId = 'work' | 'hiringSetup' | 'integrations' | 'organization'
const NAV_SECTION_ORDER: readonly NavSectionId[] = ['work', 'hiringSetup', 'integrations', 'organization']

export interface NavItem {
  readonly id: NavId
  readonly to: string
  readonly section: NavSectionId
  readonly permission?: Permission
  /** Shown only when the organization recruits for clients, except to who can turn that on (owners and admins). */
  readonly agency?: true
}

export interface NavOptions {
  readonly recruitsForClients?: boolean
}

const NAV: readonly NavItem[] = [
  { id: 'dashboard', to: '/app', section: 'work' },
  { id: 'attention', to: '/app/attention', section: 'work', permission: 'candidate:read' },
  { id: 'tasks', to: '/app/tasks', section: 'work', permission: 'task:read' },
  { id: 'jobs', to: '/app/jobs', section: 'work', permission: 'job:read' },
  // An agency's clients and their shortlists are daily work, not configuration.
  { id: 'clients', to: '/app/settings/clients', section: 'work', permission: 'client:read', agency: true },
  { id: 'jobRequests', to: '/app/job-requests', section: 'work', permission: 'job:create' },
  { id: 'candidates', to: '/app/candidates', section: 'work', permission: 'candidate:read' },
  { id: 'reports', to: '/app/reports', section: 'work', permission: 'report:read' },
  { id: 'templates', to: '/app/jobs/templates', section: 'work', permission: 'job_template:read' },
  { id: 'careersPage', to: '/app/settings/careers', section: 'hiringSetup', permission: 'careers_page:manage' },
  { id: 'distribution', to: '/app/settings/distribution', section: 'hiringSetup', permission: 'job:publish' },
  { id: 'emailTemplates', to: '/app/settings/email-templates', section: 'hiringSetup', permission: 'email_template:manage' },
  { id: 'email', to: '/app/settings/email', section: 'integrations', permission: 'email_settings:manage' },
  // The instance's language models: whoever manages its email finds them too; the page itself says who may change them.
  { id: 'ai', to: '/app/settings/ai', section: 'integrations', permission: 'email_settings:manage' },
  { id: 'webhooks', to: '/app/settings/webhooks', section: 'integrations', permission: 'webhook:manage' },
  { id: 'api', to: '/app/settings/api', section: 'integrations', permission: 'api_key:manage' },
  { id: 'imports', to: '/app/imports', section: 'integrations', permission: 'import:manage' },
  { id: 'migrations', to: '/app/migrations', section: 'integrations', permission: 'migration:manage' },
  { id: 'members', to: '/app/settings/members', section: 'organization' },
  // Everyone: the person's own second factor; owners and admins also find the organization's requirement there.
  { id: 'security', to: '/app/settings/security', section: 'organization' },
  { id: 'privacy', to: '/app/settings/privacy', section: 'organization', permission: 'privacy:manage' },
  { id: 'data', to: '/app/settings/data', section: 'organization', permission: 'data:export' },
  { id: 'audit', to: '/app/settings/audit-log', section: 'organization', permission: 'audit:read' },
]

const agencyAllows = (item: NavItem, role: Role | null, options: NavOptions): boolean => !item.agency || options.recruitsForClients === true || can(role, 'organization:update')

export const visibleNav = (role: Role | null, options: NavOptions = {}): readonly NavItem[] =>
  NAV.filter((item) => (item.permission === undefined || can(role, item.permission)) && agencyAllows(item, role, options))

export interface NavSection {
  readonly id: NavSectionId
  /** True for the configuration groups, shown more compact below the daily work. */
  readonly settings: boolean
  readonly items: readonly NavItem[]
}

/** The visible items grouped by section, in order; empty sections are left out. */
export const navSections = (role: Role | null, options: NavOptions = {}): readonly NavSection[] => {
  const items = visibleNav(role, options)
  return NAV_SECTION_ORDER.map((id) => ({ id, settings: id !== 'work', items: items.filter((item) => item.section === id) }))
    .filter((section) => section.items.length > 0)
}

/** Most specific match wins: `/app/jobs/templates` is the templates entry, not the jobs one. */
export const activeNavId = (path: string, items: readonly NavItem[]): NavId | null => {
  const matching = items.filter((item) => (item.to === '/app' ? path === '/app' : path === item.to || path.startsWith(`${item.to}/`)))
  return matching.toSorted((a, b) => b.to.length - a.to.length)[0]?.id ?? null
}
