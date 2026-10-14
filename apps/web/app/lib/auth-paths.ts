import type { Viewer } from './viewer'

const LOGIN = '/login'
const SIGNUP = '/signup'
const ONBOARDING = '/onboarding'
const HOME = '/app'
export const VERIFY_EMAIL = '/verify-email'
export const SECURITY_SETTINGS = '/app/settings/security'

/** Pure: a redirect target is honoured only when it is an in-app absolute path (no open redirect). */
export const safeRedirect = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  return raw
}

export const loginLocation = (fullPath: string): string => (fullPath === HOME || fullPath === '/' ? LOGIN : `${LOGIN}?redirect=${encodeURIComponent(fullPath)}`)

const isInvitationPath = (path: string): boolean => path.startsWith('/accept-invitation/')
const isAppPath = (path: string): boolean => path === HOME || path.startsWith(`${HOME}/`)
/**
 * Public pages, open to anyone whatever their session: the careers pages (indexable, server-rendered) and the
 * reconfirmation of imported candidates (`/consent/<token>`) and the interview feedback form (`/feedback/<token>`), both noindex.
 */
export const isPublicPath = (path: string): boolean => path === '/careers' || path.startsWith('/careers/') || path.startsWith('/consent/') || path.startsWith('/feedback/')
/** Only without a session: signing in (including its second step), signing up, asking for a reset link. */
const GUEST_PATHS: ReadonlySet<string> = new Set([LOGIN, SIGNUP, '/forgot-password', '/two-factor'])
const isGuestPath = (path: string): boolean => GUEST_PATHS.has(path)
/** With or without a session: the reset link (it signs every session out) and the "confirm your email" page. */
const isOpenAuthPath = (path: string): boolean => path === '/reset-password' || path === VERIFY_EMAIL

const afterSignIn = (viewer: Viewer, redirect: unknown): string => safeRedirect(redirect) ?? (viewer.organization ? HOME : ONBOARDING)

/**
 * Pure routing rule of the route middleware: where to send this navigation, or `null` to let it through.
 * Anonymous -> login; signed in without organization -> onboarding; signed in with one -> never back to login/onboarding.
 */
export const resolveGuard = (path: string, viewer: Viewer | null, redirect?: unknown): string | null => {
  if (isPublicPath(path) || isOpenAuthPath(path)) return null
  if (!viewer) return path === '/' ? LOGIN : isGuestPath(path) ? null : loginLocation(path)
  // A session of an address never confirmed (created before verification was required): nothing else until it is.
  if (viewer.user.emailVerified === false) return VERIFY_EMAIL
  if (path === '/') return viewer.organization ? HOME : ONBOARDING
  if (isGuestPath(path)) return afterSignIn(viewer, redirect)
  if (isInvitationPath(path)) return null
  if (path === ONBOARDING) return viewer.organization ? HOME : null
  if (isAppPath(path) && !viewer.organization) return ONBOARDING
  return null
}

/** Owners and admins without a second factor may be asked for one by their organization: the guard checks once. */
export const mayNeedTwoFactor = (path: string, viewer: Viewer | null): boolean =>
  viewer !== null &&
  viewer.organization !== null &&
  (viewer.role === 'owner' || viewer.role === 'admin') &&
  viewer.user.twoFactorEnabled !== true &&
  isAppPath(path) &&
  path !== SECURITY_SETTINGS

/**
 * Where the emailed confirmation link lands once it has signed the person in: the inbox page, which then moves on to
 * `next` (or reports an expired link). Relative, so Better Auth's origin check accepts it.
 */
export const verificationCallback = (next: string | null): string => `${VERIFY_EMAIL}?next=${encodeURIComponent(next ?? ONBOARDING)}`
