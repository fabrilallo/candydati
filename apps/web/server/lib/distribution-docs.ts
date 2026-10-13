import { buildJobsFeedXml, buildLlmsTxt, buildSitemapXml, careersSitemapEntries, DEFAULT_LOCALE, isLocale, type Locale, type PublicFeedDto } from '@tt/domain'
import { z } from 'zod'
import type { FetchLike } from './api-proxy'

/**
 * The machine-readable companions of a careers page, built from the public feed of the api
 * (`/api/v1/public/organizations/{org}/feed`): the XML jobs feed, `llms.txt` and the sitemap. Pure: `fetch`, the
 * api origin, the site URL and the clock are injected, so it is unit tested with a fake api.
 *
 * Cost: the CDN caches only a 200 (`s-maxage` and `stale-while-revalidate`, never `max-age` alone); every error is
 * `no-store`. They are not pages, so `X-Robots-Tag: noindex`.
 */
export type DocKind = 'feed' | 'llms' | 'sitemap'

export const DOC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'
const NO_STORE = 'no-store'

interface BuildInput {
  readonly data: PublicFeedDto
  readonly baseUrl: string
  readonly locale: Locale
  readonly now: Date
}

const DOCS: Readonly<Record<DocKind, { readonly contentType: string; readonly build: (input: BuildInput) => string }>> = {
  feed: { contentType: 'application/xml; charset=utf-8', build: ({ data, baseUrl, now }) => buildJobsFeedXml({ ...data, baseUrl, now }) },
  llms: { contentType: 'text/plain; charset=utf-8', build: ({ data, baseUrl, locale }) => buildLlmsTxt({ ...data, baseUrl, locale }) },
  sitemap: { contentType: 'application/xml; charset=utf-8', build: ({ data, baseUrl }) => buildSitemapXml(careersSitemapEntries({ ...data, baseUrl })) },
}

const feedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    organization: z.object({ name: z.string(), slug: z.string(), logo: z.string().nullable() }),
    jobs: z.array(z.object({ slug: z.string(), content: z.looseObject({}), publishedAt: z.string(), updatedAt: z.string() })),
  }),
})

export const feedApiPath = (org: string): string => `/api/v1/public/organizations/${encodeURIComponent(org)}/feed`

export interface DocDeps {
  readonly apiOrigin: string
  readonly siteUrl: string
  readonly locale: string
  readonly fetch: FetchLike
  readonly now?: () => Date
}

const failure = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': NO_STORE, 'x-robots-tag': 'noindex' } })

/** The feed of the organization, or the failure to serve: 404 for an unknown one, 502 when the api cannot answer. */
const loadFeed = async (org: string, deps: DocDeps): Promise<PublicFeedDto | Response> => {
  const url = `${deps.apiOrigin.replace(/\/+$/, '')}${feedApiPath(org)}`
  let upstream: Response
  try {
    upstream = await deps.fetch(url, { method: 'GET', headers: { accept: 'application/json' } })
  } catch (error) {
    console.error('[distribution] api unreachable', { org, error: error instanceof Error ? error.message : String(error) })
    return failure(502, 'Service temporarily unreachable')
  }
  if (upstream.status === 404) return failure(404, 'Not found')
  if (!upstream.ok) {
    console.error('[distribution] api answered', { org, status: upstream.status })
    return failure(502, 'Service temporarily unreachable')
  }
  const parsed = feedSchema.safeParse(await upstream.json().catch(() => null))
  if (!parsed.success) {
    console.error('[distribution] unexpected feed shape', { org })
    return failure(502, 'Service temporarily unreachable')
  }
  return parsed.data.data as unknown as PublicFeedDto
}

export const serveDoc = async (kind: DocKind, org: string, deps: DocDeps): Promise<Response> => {
  const feed = await loadFeed(org, deps)
  if (feed instanceof Response) return feed
  const locale = isLocale(deps.locale) ? deps.locale : DEFAULT_LOCALE
  try {
    const body = DOCS[kind].build({ data: feed, baseUrl: deps.siteUrl, locale, now: (deps.now ?? (() => new Date()))() })
    return new Response(body, {
      status: 200,
      headers: { 'content-type': DOCS[kind].contentType, 'cache-control': DOC_CACHE_CONTROL, 'x-robots-tag': 'noindex' },
    })
  } catch (error) {
    console.error('[distribution] build failed', { org, kind, error: error instanceof Error ? error.message : String(error) })
    return failure(502, 'Service temporarily unreachable')
  }
}
