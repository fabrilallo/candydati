import { describe, expect, it, vi } from 'vitest'
import { API_UNREACHABLE, apiTarget, downstreamResponseHeaders, isApiPath, isMcpPath, proxyToApi, upstreamRequestHeaders, type FetchLike, type ProxyRequest } from '~~/server/lib/api-proxy'

const API = 'https://api.internal'

const request = (overrides: Partial<ProxyRequest> = {}): ProxyRequest => ({
  method: 'GET',
  pathWithQuery: '/api/me',
  headers: new Headers({ cookie: 'cc.session_token=abc', origin: 'https://app.example.com', host: 'app.example.com' }),
  host: 'app.example.com',
  protocol: 'https',
  ...overrides,
})

const fakeFetch = (response: Response) => vi.fn<FetchLike>(async () => response)

describe('api proxy paths', () => {
  it('forwards only /api and below', () => {
    expect(isApiPath('/api')).toBe(true)
    expect(isApiPath('/api/auth/get-session')).toBe(true)
    expect(isApiPath('/api?x=1')).toBe(true)
    expect(isApiPath('/apifoo')).toBe(false)
    expect(isApiPath('/dashboard')).toBe(false)
  })

  it('forwards the MCP endpoint and nothing that only starts like it', () => {
    expect(isMcpPath('/mcp')).toBe(true)
    expect(isMcpPath('/mcp?x=1')).toBe(true)
    expect(isMcpPath('/mcp/')).toBe(true)
    expect(isMcpPath('/mcpx')).toBe(false)
    expect(isMcpPath('/app/mcp')).toBe(false)
  })

  it('joins the api origin and the path without double slashes', () => {
    expect(apiTarget('http://localhost:4000/', '/api/me?x=1')).toBe('http://localhost:4000/api/me?x=1')
    expect(apiTarget('http://localhost:4000', '/api/me')).toBe('http://localhost:4000/api/me')
  })
})

describe('upstream request headers', () => {
  it('keeps cookies and origin, drops host and hop-by-hop headers, adds x-forwarded-*', () => {
    const headers = upstreamRequestHeaders(
      request({ headers: new Headers({ cookie: 'a=1; b=2', origin: 'https://app.example.com', host: 'app.example.com', connection: 'keep-alive', 'content-length': '3', 'accept-encoding': 'gzip' }) }),
    )
    expect(headers.get('cookie')).toBe('a=1; b=2')
    expect(headers.get('origin')).toBe('https://app.example.com')
    expect(headers.has('host')).toBe(false)
    expect(headers.has('connection')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
    expect(headers.has('accept-encoding')).toBe(false)
    expect(headers.get('x-forwarded-host')).toBe('app.example.com')
    expect(headers.get('x-forwarded-proto')).toBe('https')
  })

  it('passes the client ip seen by the CDN in front, else the received chain', () => {
    expect(upstreamRequestHeaders(request({ headers: new Headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }) })).get('x-forwarded-for')).toBe('203.0.113.7')
    expect(upstreamRequestHeaders(request({ headers: new Headers({ 'x-forwarded-for': '198.51.100.2' }) })).get('x-forwarded-for')).toBe('198.51.100.2')
    expect(upstreamRequestHeaders(request({ headers: new Headers() })).has('x-forwarded-for')).toBe(false)
  })
})

describe('downstream response headers', () => {
  it('keeps every Set-Cookie as its own header and drops the encoding the body no longer has', () => {
    const upstream = new Headers({ 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': '10' })
    upstream.append('set-cookie', 'cc.session_token=t; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 01 Jan 2031 00:00:00 GMT')
    upstream.append('set-cookie', 'cc.session_data=d; Path=/; HttpOnly')
    const headers = downstreamResponseHeaders(upstream)
    expect(headers.getSetCookie()).toEqual(['cc.session_token=t; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 01 Jan 2031 00:00:00 GMT', 'cc.session_data=d; Path=/; HttpOnly'])
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.has('content-encoding')).toBe(false)
    expect(headers.has('content-length')).toBe(false)
  })
})

describe('proxyToApi', () => {
  it('does not follow redirects: the 302 and its cookies reach the browser', async () => {
    const upstream = new Response(null, { status: 302, headers: [['location', '/dashboard'], ['set-cookie', 'a=1; Path=/'], ['set-cookie', 'b=2; Path=/']] })
    const fetchImpl = fakeFetch(upstream)
    const response = await proxyToApi(API, request({ pathWithQuery: '/api/auth/magic-link/verify?token=t' }), fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith('https://api.internal/api/auth/magic-link/verify?token=t', expect.objectContaining({ method: 'GET', redirect: 'manual', body: undefined }))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/dashboard')
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('forwards the body of a POST and streams the answer back', async () => {
    const fetchImpl = fakeFetch(new Response('{"success":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const body = new TextEncoder().encode('{"email":"a@b.it"}')
    const response = await proxyToApi(API, request({ method: 'POST', pathWithQuery: '/api/auth/sign-in/magic-link', body }), fetchImpl)

    expect(fetchImpl.mock.calls[0]?.[1].body).toBe(body)
    expect(await response.text()).toBe('{"success":true}')
  })

  it('never sends a body on GET', async () => {
    const fetchImpl = fakeFetch(new Response('ok'))
    await proxyToApi(API, request({ body: new Uint8Array([1]) }), fetchImpl)
    expect(fetchImpl.mock.calls[0]?.[1].body).toBeUndefined()
  })

  it('answers 502 with the api envelope when the api is unreachable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await proxyToApi(API, request(), vi.fn<FetchLike>(async () => Promise.reject(new Error('connect ECONNREFUSED'))))

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ success: false, data: null, error: API_UNREACHABLE })
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
