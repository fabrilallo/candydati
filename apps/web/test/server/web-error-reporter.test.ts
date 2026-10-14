import { describe, expect, it, vi } from 'vitest'
import { createWebErrorReporter, isServerFault } from '~~/server/lib/web-error-reporter'

const DSN = 'https://pub@errors.example.org/5'
const okFetch = () => Promise.resolve(new Response('{}'))

describe('web error reporter', () => {
  it('sends nothing without a DSN, and says so when the DSN is malformed', () => {
    const fetchImpl = vi.fn(okFetch)
    const onProblem = vi.fn()
    expect(createWebErrorReporter({ dsn: '', fetchImpl }).enabled).toBe(false)
    expect(createWebErrorReporter({ dsn: 'nope', fetchImpl, onProblem }).enabled).toBe(false)
    expect(onProblem).toHaveBeenCalledWith(expect.stringContaining('not a valid DSN'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts a scrubbed envelope with the request id tag', () => {
    const fetchImpl = vi.fn(okFetch)
    const reporter = createWebErrorReporter({ dsn: DSN, fetchImpl, environment: 'production' })
    reporter.capture(Object.assign(new Error('render failed for ada@example.com'), { url: '/careers/x?token=abc', headers: { cookie: 'sid=1' } }), { request_id: 'req-12345678' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://errors.example.org/api/5/envelope/')
    const body = String(init.body)
    for (const leak of ['ada@example.com', 'token=abc', 'sid=1']) expect(body).not.toContain(leak)
    expect(body).toContain('"service":"web"')
    expect(body).toContain('"request_id":"req-12345678"')
  })

  it('caps the reports per minute and never throws', async () => {
    let clock = 0
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('down')))
    const reporter = createWebErrorReporter({ dsn: DSN, fetchImpl, maxPerMinute: 2, now: () => clock, onProblem: () => undefined })
    for (let i = 0; i < 5; i += 1) expect(() => reporter.capture(new Error('x'))).not.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    clock = 61_000
    reporter.capture(new Error('x'))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    await Promise.resolve()
  })
})

describe('isServerFault', () => {
  it('reports 5xx and errors without a status, never client errors', () => {
    expect(isServerFault(new Error('boom'))).toBe(true)
    expect(isServerFault({ statusCode: 500 })).toBe(true)
    expect(isServerFault({ statusCode: 404 })).toBe(false)
    expect(isServerFault({ statusCode: 400 })).toBe(false)
  })
})
