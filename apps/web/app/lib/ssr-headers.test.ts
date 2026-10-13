import { describe, expect, it } from 'vitest'
import { ssrAuthHeaders } from './auth-client'
import { ssrApiHeaders } from './ssr-headers'

const base = { headers: new Headers(), host: 'ats.example.com', protocol: 'https' as const }

describe('ssrApiHeaders', () => {
  it('forwards the cookie, the socket IP and the public origin', () => {
    expect(ssrApiHeaders({ ...base, cookie: 'sid=1', socketAddress: '203.0.113.7' })).toEqual({
      cookie: 'sid=1',
      'x-forwarded-for': '203.0.113.7',
      'x-forwarded-host': 'ats.example.com',
      'x-forwarded-proto': 'https',
    })
  })
  it('two clients get two different addresses, never the loopback bucket', () => {
    const a = ssrApiHeaders({ ...base, socketAddress: '203.0.113.7' })['x-forwarded-for']
    const b = ssrApiHeaders({ ...base, socketAddress: '198.51.100.2' })['x-forwarded-for']
    expect(a).not.toBe(b)
  })
  it('honours cf-connecting-ip only when trusted', () => {
    const headers = new Headers({ 'cf-connecting-ip': '9.9.9.9' })
    expect(ssrApiHeaders({ ...base, headers, socketAddress: '10.0.0.1' })['x-forwarded-for']).toBe('10.0.0.1')
    expect(ssrApiHeaders({ ...base, headers, socketAddress: '10.0.0.1', trustCloudflare: true })['x-forwarded-for']).toBe('9.9.9.9')
  })
})

describe('ssrAuthHeaders', () => {
  it('adds the site origin to the transport headers without dropping the client IP', () => {
    const transport = ssrApiHeaders({ ...base, cookie: 'sid=1', socketAddress: '203.0.113.7' })
    expect(ssrAuthHeaders(transport, 'https://ats.example.com')).toMatchObject({ cookie: 'sid=1', 'x-forwarded-for': '203.0.113.7', origin: 'https://ats.example.com' })
  })
})
