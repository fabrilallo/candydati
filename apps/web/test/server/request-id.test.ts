import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { describe, expect, it } from 'vitest'
import requestId from '~~/server/middleware/request-id'

/** Runs the middleware in front of a handler that echoes the header the api would receive. */
const call = async (headers: Record<string, string>) => {
  const app = createApp()
  app.use(requestId)
  const router = createRouter().get('/', defineEventHandler((event) => ({ forwarded: event.node.req.headers['x-request-id'] })))
  app.use(router)
  const { createServer } = await import('node:http')
  const server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const response = await fetch(`http://127.0.0.1:${port}/`, { headers })
  const body = (await response.json()) as { forwarded: string }
  await new Promise((resolve) => server.close(resolve))
  return { response, body }
}

describe('request id middleware', () => {
  it('keeps a well formed id, forwards it to the api and returns it', async () => {
    const { response, body } = await call({ 'x-request-id': 'proxy-0123456789' })
    expect(response.headers.get('x-request-id')).toBe('proxy-0123456789')
    expect(body.forwarded).toBe('proxy-0123456789')
  })

  it('replaces a malformed id and creates one when missing', async () => {
    const bad = await call({ 'x-request-id': 'not valid!!' })
    expect(bad.response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(bad.body.forwarded).toBe(bad.response.headers.get('x-request-id'))
    const none = await call({})
    expect(none.response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
