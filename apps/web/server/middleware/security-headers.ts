import { defineEventHandler, getRequestURL, setHeader } from 'h3'
import { buildSecurityHeaders, newNonce } from '../lib/security-headers'

/**
 * Security headers on every response (M10 of the security review): CSP with a per-response nonce, nosniff, referrer
 * and permissions policies, HSTS in production over https. The nonce is stored on the event for the render hook
 * (`plugins/csp-nonce.ts`) that stamps it on the inline scripts Nuxt writes.
 */
export default defineEventHandler((event) => {
  const nonce = newNonce()
  event.context.cspNonce = nonce
  const { public: config } = useRuntimeConfig(event)
  const headers = buildSecurityHeaders({
    pathname: getRequestURL(event).pathname,
    nonce,
    dev: import.meta.dev,
    https: String(config.siteUrl).startsWith('https://'),
    turnstileSiteKey: String(config.turnstileSiteKey ?? ''),
  })
  for (const [name, value] of Object.entries(headers)) setHeader(event, name, value)
})
