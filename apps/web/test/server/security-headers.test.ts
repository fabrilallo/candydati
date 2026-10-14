import { describe, expect, it } from 'vitest'
import { addNonceToScripts, buildSecurityHeaders, newNonce, wantsDocumentPolicy } from '~~/server/lib/security-headers'

const base = { pathname: '/app', nonce: 'abc123', dev: false, https: true, turnstileSiteKey: '' }

describe('buildSecurityHeaders', () => {
  it('sends a strict nonce-based CSP in production, with no eval and no framing', () => {
    const csp = buildSecurityHeaders(base)['content-security-policy']!
    expect(csp).toContain("script-src 'self' 'nonce-abc123'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-src 'self'")
    expect(csp).toContain("default-src 'self'")
  })

  it('allows only https and data images (logos), nothing for plain http', () => {
    const csp = buildSecurityHeaders(base)['content-security-policy']!
    expect(csp).toMatch(/img-src 'self' data: https:/)
    expect(csp).not.toMatch(/img-src[^;]*\shttp:/)
  })

  it('adds the always-on headers', () => {
    const headers = buildSecurityHeaders(base)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['permissions-policy']).toContain('geolocation=()')
    expect(headers['x-frame-options']).toBe('DENY')
  })

  it('sends HSTS only in production over https', () => {
    expect(buildSecurityHeaders(base)['strict-transport-security']).toMatch(/max-age=\d+/)
    expect(buildSecurityHeaders({ ...base, https: false })['strict-transport-security']).toBeUndefined()
    expect(buildSecurityHeaders({ ...base, dev: true })['strict-transport-security']).toBeUndefined()
  })

  it.each(['/consent/x', '/feedback/abc', '/accept-invitation/xyz', '/accept-invitation'])('sends no referrer from %s', (pathname) => {
    expect(buildSecurityHeaders({ ...base, pathname })['referrer-policy']).toBe('no-referrer')
  })

  it('keeps the origin as referrer elsewhere', () => {
    expect(buildSecurityHeaders({ ...base, pathname: '/careers/acme' })['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  it('relaxes eval and websockets in development only (HMR)', () => {
    const csp = buildSecurityHeaders({ ...base, dev: true })['content-security-policy']!
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain('ws:')
  })

  it('allows the Cloudflare challenge only when a Turnstile site key is configured', () => {
    expect(buildSecurityHeaders(base)['content-security-policy']).not.toContain('challenges.cloudflare.com')
    const csp = buildSecurityHeaders({ ...base, turnstileSiteKey: '0x4AAA' })['content-security-policy']!
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/)
  })

  it('leaves the document policy and framing to the api on proxied paths (the CV viewer is a same-origin frame)', () => {
    for (const pathname of ['/api/v1/applications/1/cv', '/mcp']) {
      const headers = buildSecurityHeaders({ ...base, pathname })
      expect(headers['content-security-policy']).toBeUndefined()
      expect(headers['x-frame-options']).toBeUndefined()
      expect(headers['x-content-type-options']).toBe('nosniff')
    }
    expect(wantsDocumentPolicy('/api/health')).toBe(false)
    expect(wantsDocumentPolicy('/_nuxt/entry.js')).toBe(true)
  })
})

describe('nonce', () => {
  it('is long, url-safe and different every time', () => {
    const a = newNonce()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22,}$/)
    expect(newNonce()).not.toBe(a)
  })

  it('goes on every script tag that lacks one, and only there', () => {
    const html = '<script>window.__NUXT__={}</script><script type="module" src="/_nuxt/a.js"></script><script nonce="x">1</script><scripty>no</scripty>'
    expect(addNonceToScripts(html, 'N')).toBe(
      '<script nonce="N">window.__NUXT__={}</script><script nonce="N" type="module" src="/_nuxt/a.js"></script><script nonce="x">1</script><scripty>no</scripty>',
    )
  })
})
