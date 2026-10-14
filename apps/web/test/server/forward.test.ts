import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, toNodeListener } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isApiPath } from '~~/server/lib/api-proxy'
import { forwardToApi } from '~~/server/lib/forward'

const listen = (server: Server): Promise<string> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))

const close = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()))

describe('forwardToApi (real http, fake api)', () => {
  let api: Server
  let web: Server
  let webUrl = ''
  let received: Buffer[] = []
  let config: Record<string, unknown> = {}

  beforeEach(async () => {
    received = []
    api = createServer((request, response) => {
      request.on('data', (chunk: Buffer) => received.push(chunk))
      request.on('end', () => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ bytes: Buffer.concat(received).length, path: request.url, forwarded: { host: request.headers['x-forwarded-host'], proto: request.headers['x-forwarded-proto'] } }))
      })
    })
    const apiUrl = await listen(api)
    config = { apiInternalUrl: apiUrl, trustCloudflare: false, apiMaxBodyBytes: 100, apiTimeoutMs: 5000, public: { siteUrl: 'https://jobs.example.com' } }
    vi.stubGlobal('useRuntimeConfig', () => config)
    web = createServer(toNodeListener(createApp().use(forwardToApi(isApiPath))))
    webUrl = await listen(web)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await close(web)
    await close(api)
  })

  it('streams a body under the cap to the api', async () => {
    const response = await fetch(`${webUrl}/api/v1/x?y=1`, { method: 'POST', body: 'a'.repeat(50) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ bytes: 50, path: '/api/v1/x?y=1' })
  })

  it('answers 413 for a body over the cap without reaching the api', async () => {
    const response = await fetch(`${webUrl}/api/v1/x`, { method: 'POST', body: 'a'.repeat(500) })
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('payload_too_large')
    expect(received).toHaveLength(0)
  })

  it('drops the client x-forwarded-proto and host and sets its own from the site URL', async () => {
    const response = await fetch(`${webUrl}/api/ping`, { headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'evil.test' } })
    expect((await response.json()).forwarded).toEqual({ host: 'jobs.example.com', proto: 'https' })
  })

  it('passes GET through and ignores paths that are not the api', async () => {
    expect((await fetch(`${webUrl}/api/ping`)).status).toBe(200)
    expect((await fetch(`${webUrl}/other`)).status).toBe(404)
  })
})

describe('forwardToApi with bodies and non-2xx answers (real http, fake api)', () => {
  let api: Server
  let web: Server
  let webUrl = ''
  let seen: { method?: string; type?: string; cookie?: string; body: string } = { body: '' }

  beforeEach(async () => {
    seen = { body: '' }
    api = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        seen = { method: request.method, type: request.headers['content-type'], cookie: request.headers.cookie, body: Buffer.concat(chunks).toString('latin1') }
        const status = Number(new URL(request.url ?? '/', 'http://x').searchParams.get('status') ?? 200)
        response.statusCode = status
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ status }))
      })
    })
    const apiUrl = await listen(api)
    const config = { apiInternalUrl: apiUrl, trustCloudflare: false, apiMaxBodyBytes: 1_000_000, apiTimeoutMs: 5000, public: { siteUrl: 'https://jobs.example.com' } }
    vi.stubGlobal('useRuntimeConfig', () => config)
    web = createServer(toNodeListener(createApp().use(forwardToApi(isApiPath))))
    webUrl = await listen(web)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await close(web)
    await close(api)
  })

  it('forwards a JSON POST and the 401 the api answers (a failed sign-in) instead of a 502', async () => {
    const response = await fetch(`${webUrl}/api/auth/sign-in/email?status=401`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'a=b' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x' }),
    })
    expect(response.status).toBe(401)
    expect(seen).toMatchObject({ method: 'POST', type: 'application/json', cookie: 'a=b', body: '{"email":"a@b.co","password":"x"}' })
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('forwards a %s with a body, whatever the status', async (method) => {
    for (const status of [200, 204, 400, 403, 404, 409, 500]) {
      const response = await fetch(`${webUrl}/api/v1/x?status=${status}`, { method, headers: { 'content-type': 'application/json' }, body: '{"k":1}' })
      expect(response.status).toBe(status)
      expect(seen).toMatchObject({ method, body: '{"k":1}' })
    }
  })

  it('forwards a multipart upload byte for byte, binary included', async () => {
    const form = new FormData()
    form.set('name', 'cv')
    form.set('file', new Blob([new Uint8Array([0, 255, 10, 13, 128])], { type: 'application/pdf' }), 'cv.pdf')
    const response = await fetch(`${webUrl}/api/v1/upload?status=401`, { method: 'POST', body: form })
    expect(response.status).toBe(401)
    expect(seen.type).toMatch(/^multipart\/form-data; boundary=/)
    expect(seen.body).toContain('name="file"; filename="cv.pdf"')
    expect(seen.body).toContain(String.fromCharCode(0, 255, 10, 13, 128))
  })
})
