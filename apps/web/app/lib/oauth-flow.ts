import { grantablePermissions, MCP_OAUTH_PROPOSE_MOVE_SCOPE, type ConsentPreview, type Role } from '@candydati/domain'
import { defaultFailureKey, type FailureInfo } from './api-call'
import { safeRedirect } from './auth-paths'

/**
 * Pure rules of the OAuth pages that connect an MCP client (Claude, ...) to the person's account: what to send back,
 * where it is safe to go next, what to show.
 */

/** Same bound as the api's `consentPreviewRequestSchema`. */
const OAUTH_QUERY_MAX = 8192

/**
 * The signed authorization request is the page's own query string, sent back as received (no reordering, no
 * dropped parameter): the server checks its signature. `null` when there is none.
 */
export const oauthQueryOf = (search: string): string | null => {
  const query = search.startsWith('?') ? search.slice(1) : search
  return query === '' || query.length > OAUTH_QUERY_MAX ? null : query
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && value.startsWith(`${url.protocol}//`)
  } catch {
    return false
  }
}

/**
 * Where the server told the browser to go: the app's redirect address (with the code or the error) or a page of this
 * origin. Anything else (another scheme, a protocol-relative address) is refused.
 */
export const safeNextUrl = (url: unknown): string | null => {
  if (typeof url !== 'string' || url === '') return null
  if (url.startsWith('/')) return safeRedirect(url)
  return isHttpUrl(url) ? url : null
}

/** The host (with its port) the browser lands on after the answer: what the person must recognise. */
export const redirectHost = (uri: string): string | null => {
  try {
    return new URL(uri).host || null
  } catch {
    return null
  }
}

type ConsentOrganization = ConsentPreview['organizations'][number]

/** The organization picked at first: the active one, else the first; one the person cannot connect yet only if no other works. */
export const defaultOrganizationId = (organizations: readonly ConsentOrganization[]): string | null => {
  const usable = organizations.filter((organization) => !organization.twoFactorRequired)
  const pool = usable.length > 0 ? usable : organizations
  return (pool.find((organization) => organization.active) ?? pool[0])?.id ?? null
}

/** The app asked to propose moves and the person's role may: the consent page offers the opt-in (unchecked). */
export const offersProposeMove = (requested: readonly string[], role: Role): boolean =>
  requested.includes(MCP_OAUTH_PROPOSE_MOVE_SCOPE) && grantablePermissions(role, 'connected_app').includes(MCP_OAUTH_PROPOSE_MOVE_SCOPE)

/**
 * The scopes granted on "Allow", space separated as OAuth wants them: what the app asked for, without the opt-in to propose
 * moves unless the person ticked it (and their role may). Never more than was asked.
 */
export const grantedScope = (requested: readonly string[], role: Role, proposeMove: boolean): string =>
  requested.filter((scope) => scope !== MCP_OAUTH_PROPOSE_MOVE_SCOPE || (proposeMove && offersProposeMove(requested, role))).join(' ')

const CODE_KEYS: Readonly<Record<string, string>> = {
  TWO_FACTOR_REQUIRED: 'oauth.errors.twoFactorRequired',
  NOT_A_MEMBER: 'oauth.errors.notAMember',
  NO_ACTIVE_ORGANIZATION: 'oauth.errors.noOrganization',
}

/** A request the server no longer accepts (signature, expiry, unknown client): the person starts again from the app. */
const EXPIRED_STATUSES: ReadonlySet<number> = new Set([400, 401, 404, 422])

/** Translation key of a failed OAuth call: the known codes first, then an expired request, then the usual keys. */
export const oauthFailureKey = (failure: FailureInfo): string => {
  const byCode = failure.code ? CODE_KEYS[failure.code.toUpperCase()] : undefined
  if (byCode) return byCode
  return EXPIRED_STATUSES.has(failure.status) ? 'oauth.errors.expired' : defaultFailureKey(failure)
}
