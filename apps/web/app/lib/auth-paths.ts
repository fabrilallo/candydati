import type { Viewer } from './viewer'

const LOGIN = '/login'
const SIGNUP = '/signup'
const ONBOARDING = '/onboarding'
const HOME = '/app'

/** Pure: a redirect target is honoured only when it is an in-app absolute path (no open redirect). */
export const safeRedirect = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  return raw
}

export const loginLocation = (fullPath: string): string => (fullPath === HOME || fullPath === '/' ? LOGIN : `${LOGIN}?redirect=${encodeURIComponent(fullPath)}`)

const isInvitationPath = (path: string): boolean => path.startsWith('/accept-invitation/')
const isAppPath = (path: string): boolean => path === HOME || path.startsWith(`${HOME}/`)
/** Public careers pages: indexable, server-rendered, open to anyone whatever their session. */
export const isPublicPath = (path: string): boolean => path === '/careers' || path.startsWith('/careers/')
const isGuestPath = (path: string): boolean => path === LOGIN || path === SIGNUP

const afterSignIn = (viewer: Viewer, redirect: unknown): string => safeRedirect(redirect) ?? (viewer.organization ? HOME : ONBOARDING)

/**
 * Pure routing rule of the route middleware: where to send this navigation, or `null` to let it through.
 * Anonymous -> login; signed in without organization -> onboarding; signed in with one -> never back to login/onboarding.
 */
export const resolveGuard = (path: string, viewer: Viewer | null, redirect?: unknown): string | null => {
  if (isPublicPath(path)) return null
  if (path === '/') return viewer ? (viewer.organization ? HOME : ONBOARDING) : LOGIN
  if (!viewer) return isGuestPath(path) ? null : loginLocation(path)
  if (isGuestPath(path)) return afterSignIn(viewer, redirect)
  if (isInvitationPath(path)) return null
  if (path === ONBOARDING) return viewer.organization ? HOME : null
  if (isAppPath(path) && !viewer.organization) return ONBOARDING
  return null
}
