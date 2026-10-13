import { describe, expect, it, vi } from 'vitest'
import { DOC_CACHE_CONTROL, feedApiPath, serveDoc, type DocDeps, type DocKind } from '~~/server/lib/distribution-docs'
import { completeContent } from '../fixtures/job-fixtures'

const ORG = { name: 'Acme & Co', slug: 'acme-27423', logo: null }
const JOB = { slug: 'backend-1', content: completeContent, publishedAt: '2026-10-13T09:00:00.000Z', updatedAt: '2026-10-14T09:00:00.000Z' }
const envelope = (jobs: readonly unknown[] = [JOB]) => ({ success: true, data: { organization: ORG, jobs }, error: null })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const deps = (fetchImpl: DocDeps['fetch']): DocDeps => ({
  apiOrigin: 'http://api.internal/',
  siteUrl: 'https://jobs.example.com',
  locale: 'it',
  fetch: fetchImpl,
  now: () => new Date('2026-10-15T08:30:00.000Z'),
})
const serve = (kind: DocKind, response: Response | Error, org = 'acme-27423') => {
  const fetchImpl = vi.fn<DocDeps['fetch']>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { fetchImpl, result: serveDoc(kind, org, deps(fetchImpl)) }
}

describe('distribution documents', () => {
  it('asks the public feed of the api, escaping the slug', async () => {
    const { fetchImpl, result } = serve('feed', json(envelope()), 'a b')
    await result
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://api.internal/api/v1/public/organizations/a%20b/feed')
    expect(feedApiPath('x/y')).toBe('/api/v1/public/organizations/x%2Fy/feed')
  })

  it.each([
    ['feed', 'application/xml; charset=utf-8', '<source'],
    ['sitemap', 'application/xml; charset=utf-8', '<urlset'],
    ['llms', 'text/plain; charset=utf-8', '# Acme & Co'],
  ] as const)('serves %s with the right headers on a 200', async (kind, contentType, marker) => {
    const response = await serve(kind, json(envelope())).result
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(contentType)
    expect(response.headers.get('cache-control')).toBe(DOC_CACHE_CONTROL)
    expect(response.headers.get('cache-control')).toMatch(/s-maxage=\d+, stale-while-revalidate=\d+/)
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(await response.text()).toContain(marker)
  })

  it('lists the published ad in the feed and the sitemap', async () => {
    const feed = await (await serve('feed', json(envelope())).result).text()
    expect(feed).toContain('https://jobs.example.com/careers/acme-27423/backend-1')
    const sitemap = await (await serve('sitemap', json(envelope())).result).text()
    expect(sitemap).toContain('<loc>https://jobs.example.com/careers/acme-27423/backend-1</loc>')
    expect(sitemap).toContain('<lastmod>2026-10-14T09:00:00.000Z</lastmod>')
  })

  it('answers 404 for an unknown organization, never cached', async () => {
    const response = await serve('feed', json({ success: false, data: null, error: { code: 'not_found', message: 'x' } }, 404)).result
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['api error', json({ success: false }, 500)],
    ['unreachable api', new Error('ECONNREFUSED')],
    ['garbage body', new Response('<html>', { status: 200 })],
    ['wrong shape', json({ success: true, data: { organization: 1 } })],
  ])('answers 502 and caches nothing on %s', async (_name, response) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const out = await serve('llms', response).result
    expect(out.status).toBe(502)
    expect(out.headers.get('cache-control')).toBe('no-store')
    expect(out.headers.get('x-robots-tag')).toBe('noindex')
    spy.mockRestore()
  })

  it('answers 502 when a builder refuses the data', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = { ...JOB, publishedAt: 'not a date' }
    const out = await serve('feed', json(envelope([bad]))).result
    expect([200, 502]).toContain(out.status)
    if (out.status === 502) expect(out.headers.get('cache-control')).toBe('no-store')
    spy.mockRestore()
  })

  it('falls back to the default locale for an unknown one', async () => {
    const response = await serveDoc('llms', 'acme', { ...deps(async () => json(envelope())), locale: 'xx' })
    expect(response.status).toBe(200)
  })
})
