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
        response.end(JSON.stringify({ bytes: Buffer.concat(received).length, path: request.url }))
      })
    })
    const apiUrl = await listen(api)
    config = { apiInternalUrl: apiUrl, trustCloudflare: false, apiMaxBodyBytes: 100, apiTimeoutMs: 5000 }
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
    expect(await response.json()).toEqual({ bytes: 50, path: '/api/v1/x?y=1' })
  })

  it('answers 413 for a body over the cap without reaching the api', async () => {
    const response = await fetch(`${webUrl}/api/v1/x`, { method: 'POST', body: 'a'.repeat(500) })
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('payload_too_large')
    expect(received).toHaveLength(0)
  })

  it('passes GET through and ignores paths that are not the api', async () => {
    expect((await fetch(`${webUrl}/api/ping`)).status).toBe(200)
    expect((await fetch(`${webUrl}/other`)).status).toBe(404)
  })
})
