import { describe, expect, it } from 'vitest'
import { clientIpOf, forwardedForHeader, normalizeIp } from './client-ip'

const headers = (init: Record<string, string> = {}) => new Headers(init)

describe('normalizeIp', () => {
  it('accepts IPv4 and IPv6, unwraps IPv4-mapped, rejects anything else', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizeIp('999.1.1.1')).toBeNull()
    expect(normalizeIp('evil, 1.2.3.4')).toBeNull()
    expect(normalizeIp('')).toBeNull()
    expect(normalizeIp(undefined)).toBeNull()
  })
})

describe('clientIpOf', () => {
  it('uses the socket and ignores a client-sent cf-connecting-ip by default', () => {
    expect(clientIpOf({ headers: headers({ 'cf-connecting-ip': '9.9.9.9' }), socketAddress: '10.0.0.5' })).toBe('10.0.0.5')
  })
  it('uses cf-connecting-ip only when Cloudflare is trusted and it is an address', () => {
    expect(clientIpOf({ headers: headers({ 'cf-connecting-ip': '9.9.9.9' }), socketAddress: '10.0.0.5', trustCloudflare: true })).toBe('9.9.9.9')
    expect(clientIpOf({ headers: headers({ 'cf-connecting-ip': 'nope' }), socketAddress: '10.0.0.5', trustCloudflare: true })).toBe('10.0.0.5')
  })
})

describe('clientIpOf behind a trusted reverse proxy', () => {
  const proxy = '172.31.77.11'
  it('uses the last x-forwarded-for entry, the one the trusted proxy appended', () => {
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9' }), socketAddress: proxy, trustedProxy: proxy })).toBe('9.9.9.9')
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '6.6.6.6, 9.9.9.9' }), socketAddress: proxy, trustedProxy: proxy })).toBe('9.9.9.9')
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9' }), socketAddress: `::ffff:${proxy}`, trustedProxy: proxy })).toBe('9.9.9.9')
  })
  it('ignores x-forwarded-for from any other peer, or when no proxy is configured', () => {
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9' }), socketAddress: '10.0.0.5', trustedProxy: proxy })).toBe('10.0.0.5')
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9' }), socketAddress: proxy })).toBe(proxy)
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9' }), socketAddress: proxy, trustedProxy: '' })).toBe(proxy)
  })
  it('falls back to the socket when the proxy sent no usable address', () => {
    expect(clientIpOf({ headers: headers(), socketAddress: proxy, trustedProxy: proxy })).toBe(proxy)
    expect(clientIpOf({ headers: headers({ 'x-forwarded-for': '9.9.9.9, nope' }), socketAddress: proxy, trustedProxy: proxy })).toBe(proxy)
  })
})

describe('forwardedForHeader', () => {
  it('is one clean header, or nothing when the client is unknown', () => {
    expect(forwardedForHeader({ headers: headers(), socketAddress: '::ffff:1.2.3.4' })).toEqual({ 'x-forwarded-for': '1.2.3.4' })
    expect(forwardedForHeader({ headers: headers() })).toEqual({})
  })
})
