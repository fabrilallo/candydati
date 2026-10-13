import { defineEventHandler, getRequestURL, setHeader } from 'h3'

/**
 * `x-robots-tag` on every page we render. A middleware rather than a `routeRules` header so the exclusions
 * below stay explicit and tested. The render is already an invocation, so setting the header costs nothing;
 * static files never reach it (Cloudflare serves them before the Worker).
 */
export const NOINDEX = 'noindex, nofollow'

/** `/api/**` is proxied to the api (its own headers) and `/_nuxt/**` is immutable static: neither is ours to label. */
export const wantsRobotsHeader = (pathname: string): boolean => !pathname.startsWith('/api/') && !pathname.startsWith('/_nuxt/') && !pathname.startsWith('/_fonts/')

export default defineEventHandler((event) => {
  if (wantsRobotsHeader(getRequestURL(event).pathname)) setHeader(event, 'x-robots-tag', NOINDEX)
})
