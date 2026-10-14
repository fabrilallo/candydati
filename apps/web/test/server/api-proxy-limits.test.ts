import { describe, expect, it, vi } from 'vitest'
import { proxyToApi, type FetchLike, type ProxyRequest } from '~~/server/lib/api-proxy'

const API = 'https://api.internal'

const request = (overrides: Partial<ProxyRequest> = {}): ProxyRequest => ({
  method: 'POST',
  pathWithQuery: '/api/v1/imports',
  headers: new Headers(),
  host: 'app.example.com',
  protocol: 'https',
  ...overrides,
})

const streamOf = (...chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })

/** A fetch that reads the whole request body, as the real one does, then answers 200. */
const drainingFetch = () =>
  vi.fn<FetchLike>(async (_url, init) => {
    if (init.body instanceof ReadableStream) {
      const reader = init.body.getReader()
      while (!(await reader.read()).done) continue
    }
    return new Response('ok')
  })

describe('proxy body cap', () => {
  it('refuses a declared content-length over the cap without calling the api', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    const response = await proxyToApi(API, request({ headers: new Headers({ 'content-length': '11' }), maxBodyBytes: 10, body: streamOf(new Uint8Array(11)) }), fetchImpl)
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('payload_too_large')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('streams the body with duplex half and lets a body under the cap through', async () => {
    const fetchImpl = drainingFetch()
    const response = await proxyToApi(API, request({ maxBodyBytes: 10, body: streamOf(new Uint8Array(4), new Uint8Array(6)) }), fetchImpl)
    expect(response.status).toBe(200)
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ duplex: 'half' })
  })

  it('stops a body that outgrows the cap while streaming, whatever it declared', async () => {
    const response = await proxyToApi(API, request({ maxBodyBytes: 10, body: streamOf(new Uint8Array(6), new Uint8Array(6)) }), drainingFetch())
    expect(response.status).toBe(413)
  })

  it('does not count buffered bodies as streams', async () => {
    const fetchImpl = drainingFetch()
    await proxyToApi(API, request({ body: new Uint8Array([1, 2]) }), fetchImpl)
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('duplex')
  })
})

describe('proxy timeout and abort', () => {
  const hangingFetch = () =>
    vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )

  it('answers 504 when the api does not start answering in time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await proxyToApi(API, request({ method: 'GET', timeoutMs: 20 }), hangingFetch())
    expect(response.status).toBe(504)
    expect((await response.json()).error.code).toBe('api_timeout')
  })

  it('aborts the upstream call when the client goes away', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const client = new AbortController()
    const fetchImpl = hangingFetch()
    const pending = proxyToApi(API, request({ method: 'GET', signal: client.signal }), fetchImpl)
    client.abort()
    const response = await pending
    expect(fetchImpl.mock.calls[0]?.[1].signal?.aborted).toBe(true)
    expect(response.status).toBe(502)
  })

  it('does not time out the answer body once headers arrived', async () => {
    const response = await proxyToApi(API, request({ method: 'GET', timeoutMs: 20 }), vi.fn<FetchLike>(async () => new Response('x')))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(await response.text()).toBe('x')
  })
})
