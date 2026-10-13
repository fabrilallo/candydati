/**
 * Same-origin proxy from `/api/**` to the Fastify api. Pure: no h3, no runtime config, `fetch` injected, so it
 * is unit tested with a fake fetch.
 *
 * Why not the Nitro `proxy` route rule: its target is baked in at build time, while here the api origin is read
 * from `NUXT_API_INTERNAL_URL` at runtime (docker). Returning a web `Response` also streams the body untouched.
 */

/** Hop-by-hop (RFC 9110 7.6.1) and connection-specific headers: never forwarded upstream. */
const DROPPED_REQUEST_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'expect',
  'host',
  'content-length',
  'accept-encoding',
])

/**
 * Dropped from the api response: `fetch` already decoded the body, so the original encoding and length
 * would lie. `set-cookie` is copied apart, one header per cookie (`getSetCookie`), never comma-joined.
 */
const DROPPED_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'set-cookie'])

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])

export interface ProxyRequest {
  readonly method: string
  /** Path and query of the incoming request, e.g. `/api/me?x=1`. */
  readonly pathWithQuery: string
  readonly headers: Headers
  /** Raw body for methods that carry one. */
  readonly body?: Uint8Array | undefined
  /** Public host and protocol of the web origin, forwarded as `x-forwarded-*`. */
  readonly host: string
  readonly protocol: 'http' | 'https'
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export const API_UNREACHABLE = { code: 'api_unreachable', message: 'The service is temporarily unreachable' } as const

/** Only `/api` and `/api/...`: anything else is not ours to forward (and never escapes the api origin). */
export const isApiPath = (pathWithQuery: string): boolean => /^\/api(?:[/?]|$)/.test(pathWithQuery)

/** The MCP endpoint (`{siteUrl}/mcp`), forwarded as is: the bearer key travels in `Authorization`, untouched. */
export const isMcpPath = (pathWithQuery: string): boolean => /^\/mcp\/?(?:\?|$)/.test(pathWithQuery)

export const apiTarget = (apiOrigin: string, pathWithQuery: string): string => `${apiOrigin.replace(/\/+$/, '')}${pathWithQuery}`

/** The client IP as a CDN in front saw it, else the chain we received: the api (`trustProxy`) reads the leftmost. */
const forwardedFor = (headers: Headers): string | null => headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')

export const upstreamRequestHeaders = (request: Pick<ProxyRequest, 'headers' | 'host' | 'protocol'>): Headers => {
  const out = new Headers()
  request.headers.forEach((value, name) => {
    if (!DROPPED_REQUEST_HEADERS.has(name)) out.set(name, value)
  })
  const clientIp = forwardedFor(request.headers)
  if (clientIp) out.set('x-forwarded-for', clientIp)
  out.set('x-forwarded-host', request.host)
  out.set('x-forwarded-proto', request.protocol)
  return out
}

export const downstreamResponseHeaders = (upstream: Headers): Headers => {
  const out = new Headers()
  upstream.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) out.set(name, value)
  })
  for (const cookie of upstream.getSetCookie()) out.append('set-cookie', cookie)
  return out
}

const unreachable = (): Response =>
  new Response(JSON.stringify({ success: false, data: null, error: API_UNREACHABLE }), {
    status: 502,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/**
 * Forwards one request and returns the api response as is: status (3xx included, `redirect: 'manual'` so
 * auth callbacks reach the browser with their cookies), headers, every `Set-Cookie`, streamed body.
 */
export const proxyToApi = async (apiOrigin: string, request: ProxyRequest, fetchImpl: FetchLike): Promise<Response> => {
  const hasBody = !METHODS_WITHOUT_BODY.has(request.method.toUpperCase()) && request.body !== undefined
  try {
    const upstream = await fetchImpl(apiTarget(apiOrigin, request.pathWithQuery), {
      method: request.method,
      headers: upstreamRequestHeaders(request),
      body: hasBody ? (request.body as BodyInit) : undefined,
      redirect: 'manual',
    })
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: downstreamResponseHeaders(upstream.headers) })
  } catch (error) {
    console.error('[api-proxy] api unreachable', { method: request.method, path: request.pathWithQuery.split('?')[0], error: error instanceof Error ? error.message : String(error) })
    return unreachable()
  }
}
