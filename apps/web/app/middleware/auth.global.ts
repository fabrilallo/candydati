import { isPublicPath, mayNeedTwoFactor, resolveGuard, SECURITY_SETTINGS } from '@/lib/auth-paths'
import { mustEnrolTwoFactor } from '@/lib/security-api'
import { hasSessionCookie } from '@/lib/session-cookie'

/**
 * Unauthenticated -> /login; signed in without organization -> /onboarding (rules in `resolveGuard`).
 * `/careers/**` is public and skipped entirely. If the api cannot be reached the navigation fails loudly (error page) instead of bouncing to login.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Public careers pages never need the session: no api call for anonymous visitors, no redirect for signed-in ones.
  if (isPublicPath(to.path)) return
  const { ensure, clear } = useViewer()
  let viewer
  try {
    // No session cookie on the server: anonymous, no api call.
    if (import.meta.server && !hasSessionCookie(useRequestHeaders(['cookie']).cookie)) clear()
    viewer = await ensure()
  } catch (error) {
    console.error('[auth middleware] could not load the session', error instanceof Error ? error.message : error)
    if (['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/two-factor'].includes(to.path)) return
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable', fatal: true })
  }
  const target = resolveGuard(to.path, viewer, to.query.redirect)
  if (target && target !== to.fullPath) return navigateTo(target)
  // An owner or admin without a second factor, in an organization that requires one: enrol first (checked once per load).
  if (mayNeedTwoFactor(to.path, viewer ?? null)) {
    const gate = useState<boolean | null>('two-factor-gate', () => null)
    gate.value ??= await mustEnrolTwoFactor(useJobsApi())
    if (gate.value) return navigateTo({ path: SECURITY_SETTINGS, query: { required: '1' } })
  }
})
