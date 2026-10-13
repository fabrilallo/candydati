import { isPublicPath, resolveGuard } from '@/lib/auth-paths'
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
    if (to.path === '/login' || to.path === '/signup') return
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable', fatal: true })
  }
  const target = resolveGuard(to.path, viewer, to.query.redirect)
  if (target && target !== to.fullPath) return navigateTo(target)
})
