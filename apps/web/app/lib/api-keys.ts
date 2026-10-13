import { API_KEY_NAME_MAX, grantablePermissions, type Permission, type Resource, type Role } from '@tt/domain'

/** Areas of the scope picker, in order, and the resources each one gathers. */
const AREAS = [
  ['jobs', ['job', 'job_template']],
  ['candidates', ['candidate', 'candidate_note']],
  ['communication', ['message', 'email_template']],
  ['work', ['task', 'automation']],
  ['organization', ['organization', 'audit']],
] as const satisfies ReadonlyArray<readonly [string, readonly Resource[]]>

export type ScopeArea = (typeof AREAS)[number][0] | 'other'

export interface ScopeGroup {
  readonly area: ScopeArea
  readonly scopes: readonly Permission[]
}

const resourceOf = (permission: Permission): Resource => permission.split(':')[0] as Resource

/**
 * What a key created by `role` may hold, grouped by area: the role's permissions minus what a machine may never do
 * (`grantablePermissions` of the domain). A key never has more than its creator. Empty areas are left out.
 */
export const scopeGroups = (role: Role | null): readonly ScopeGroup[] => {
  if (role === null) return []
  const grantable = grantablePermissions(role, 'api_key')
  const known = new Set<Resource>(AREAS.flatMap(([, resources]) => resources))
  const grouped: readonly ScopeGroup[] = AREAS.map(([area, resources]) => ({
    area,
    scopes: grantable.filter((scope) => (resources as readonly Resource[]).includes(resourceOf(scope))),
  }))
  const other: ScopeGroup = { area: 'other', scopes: grantable.filter((scope) => !known.has(resourceOf(scope))) }
  return [...grouped, other].filter((group) => group.scopes.length > 0)
}

/** What no key can do, in plain words (the picker explains why instead of listing raw permissions). */
export const withheldAreas = ['decisions', 'messages', 'administration'] as const

export const scopeLabelKey = (scope: Permission): string => `apiKeys.scope.${scope.replace(':', '.')}`

export const toggleScope = (scopes: readonly Permission[], scope: Permission): readonly Permission[] =>
  scopes.includes(scope) ? scopes.filter((item) => item !== scope) : [...scopes, scope]

export const EXPIRY_CHOICES = ['never', '30', '90', '365'] as const
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]

export interface KeyForm {
  readonly name: string
  readonly scopes: readonly Permission[]
  readonly expiry: ExpiryChoice
}

export type KeyFormErrors = Partial<Record<'name' | 'scopes', string>>

export const validateKeyForm = (form: KeyForm): KeyFormErrors => {
  const name = form.name.trim()
  const nameError = name === '' ? 'apiKeys.errors.nameRequired' : name.length > API_KEY_NAME_MAX ? 'apiKeys.errors.nameTooLong' : null
  return {
    ...(nameError ? { name: nameError } : {}),
    ...(form.scopes.length === 0 ? { scopes: 'apiKeys.errors.scopesRequired' } : {}),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The expiry sent to the api: an ISO date `days` from now, or null for a key that does not expire. */
export const expiryDate = (choice: ExpiryChoice, now: Date): string | null =>
  choice === 'never' ? null : new Date(now.getTime() + Number(choice) * DAY_MS).toISOString()

export type KeyStatus = 'active' | 'expired' | 'revoked'

export const keyStatus = (key: { readonly revokedAt: string | null; readonly expiresAt: string | null }, now: Date): KeyStatus => {
  if (key.revokedAt) return 'revoked'
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'active'
}

/** The MCP endpoint on the public origin of the app (the web proxies `/mcp` to the api). */
export const mcpEndpoint = (siteUrl: string): string => `${siteUrl.replace(/\/+$/, '')}/mcp`

const slug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A config block most MCP clients accept (Streamable HTTP with a bearer header). */
export const mcpConfigSnippet = (input: { readonly serverName: string; readonly url: string; readonly token: string }): string => {
  const name = slug(input.serverName) || 'ats'
  const config = { mcpServers: { [name]: { type: 'http', url: input.url, headers: { Authorization: `Bearer ${input.token}` } } } }
  return JSON.stringify(config, null, 2)
}
