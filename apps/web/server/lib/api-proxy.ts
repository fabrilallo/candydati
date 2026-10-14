import { clientIpOf, forwardedForHeader } from '../../app/lib/client-ip'

export { clientIpOf }

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
 * Who the client is, as the client itself claims it: never believed. The api reads one clean `x-forwarded-for` that
 * only this proxy writes (see `clientIpOf`), so every one of these is dropped from the request and replaced.
 */
const CLIENT_ADDRESS_HEADERS = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'forwarded', 'x-client-ip']

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
  /** Body for methods that carry one: bytes, or a stream that is piped upstream without buffering. */
  readonly body?: Uint8Array | ReadableStream<Uint8Array> | undefined
  /** Largest request body accepted, in bytes. Counted while streaming, so a missing or lying `content-length` does not help. */
  readonly maxBodyBytes?: number | undefined
  /** Milliseconds to wait for the api to start answering (response headers). The body of the answer is not time limited. */
  readonly timeoutMs?: number | undefined
  /** Aborts the upstream call, e.g. when the browser disconnects. */
  readonly signal?: AbortSignal | undefined
  /** Public host and protocol of the web origin, forwarded as `x-forwarded-*`. */
  readonly host: string
  readonly protocol: 'http' | 'https'
  /** Address of the TCP peer that connected to the web server (the socket), the only address that cannot be forged. */
  readonly socketAddress?: string | undefined
  /** `NUXT_TRUST_CLOUDFLARE=true`: the web runs behind Cloudflare and only Cloudflare can reach it, so its `cf-connecting-ip` is the client. */
  readonly trustCloudflare?: boolean | undefined
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export const API_TIMEOUT = { code: 'api_timeout', message: 'The service took too long to answer' } as const
export const BODY_TOO_LARGE = { code: 'payload_too_large', message: 'The request body is too large' } as const

/** Default for `NUXT_API_MAX_BODY_BYTES`: the api's largest route limit (import upload, 200 MiB + 4 MiB of form overhead). */
export const DEFAULT_MAX_BODY_BYTES = 204 * 1024 * 1024
/** Default for `NUXT_API_TIMEOUT_MS`. */
export const DEFAULT_TIMEOUT_MS = 300_000

class BodyTooLargeError extends Error {}

export const API_UNREACHABLE = { code: 'api_unreachable', message: 'The service is temporarily unreachable' } as const

/** Only `/api` and `/api/...`: anything else is not ours to forward (and never escapes the api origin). */
export const isApiPath = (pathWithQuery: string): boolean => /^\/api(?:[/?]|$)/.test(pathWithQuery)

/** The MCP endpoint (`{siteUrl}/mcp`), forwarded as is: the bearer key travels in `Authorization`, untouched. */
export const isMcpPath = (pathWithQuery: string): boolean => /^\/mcp\/?(?:\?|$)/.test(pathWithQuery)

export const apiTarget = (apiOrigin: string, pathWithQuery: string): string => `${apiOrigin.replace(/\/+$/, '')}${pathWithQuery}`

export const upstreamRequestHeaders = (request: Pick<ProxyRequest, 'headers' | 'host' | 'protocol' | 'socketAddress' | 'trustCloudflare'>): Headers => {
  const out = new Headers()
  request.headers.forEach((value, name) => {
    if (!DROPPED_REQUEST_HEADERS.has(name) && !CLIENT_ADDRESS_HEADERS.includes(name)) out.set(name, value)
  })
  for (const [name, value] of Object.entries(forwardedForHeader(request))) out.set(name, value)
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

const jsonError = (status: number, error: { code: string; message: string }): Response =>
  new Response(JSON.stringify({ success: false, data: null, error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/** Passes the chunks through and errors the stream as soon as more than `max` bytes went by. */
const limitStream = (source: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> => {
  let seen = 0
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength
        if (seen > max) throw new BodyTooLargeError()
        controller.enqueue(chunk)
      },
    }),
  )
}

const declaredLength = (headers: Headers): number => {
  const value = Number(headers.get('content-length'))
  return Number.isFinite(value) ? value : 0
}

const upstreamBody = (request: ProxyRequest, max: number): BodyInit | undefined => {
  if (METHODS_WITHOUT_BODY.has(request.method.toUpperCase()) || request.body === undefined) return undefined
  return request.body instanceof Uint8Array ? (request.body as BodyInit) : limitStream(request.body, max)
}

const isTimeout = (error: unknown, timedOut: () => boolean): boolean => timedOut() && error instanceof Error

const failureResponse = (request: ProxyRequest, error: unknown, timedOut: boolean): Response => {
  if (error instanceof BodyTooLargeError || (error instanceof Error && error.cause instanceof BodyTooLargeError)) return jsonError(413, BODY_TOO_LARGE)
  const path = request.pathWithQuery.split('?')[0]
  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
  const message = `${error instanceof Error ? error.message : String(error)}${cause}`
  if (timedOut) {
    console.error('[api-proxy] api timeout', { method: request.method, path })
    return jsonError(504, API_TIMEOUT)
  }
  console.error('[api-proxy] api unreachable', { method: request.method, path, error: message })
  return jsonError(502, API_UNREACHABLE)
}

/**
 * Forwards one request and returns the api response as is: status (3xx included, `redirect: 'manual'` so
 * auth callbacks reach the browser with their cookies), headers, every `Set-Cookie`, streamed body.
 * The request body is capped (413) and the wait for the api is bounded (504); the caller's signal is propagated.
 */
export const proxyToApi = async (apiOrigin: string, request: ProxyRequest, fetchImpl: FetchLike): Promise<Response> => {
  const max = request.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  if (declaredLength(request.headers) > max) return jsonError(413, BODY_TOO_LARGE)
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal?.reason)
  if (request.signal?.aborted) abort()
  request.signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const body = upstreamBody(request, max)
    const upstream = await fetchImpl(apiTarget(apiOrigin, request.pathWithQuery), {
      method: request.method,
      headers: upstreamRequestHeaders(request),
      body,
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      redirect: 'manual',
      // The proxy forwards the client's own Cookie and Authorization headers. With the default credentials mode, fetch
      // fails any 401 answer to a streamed body ("expected non-null body source"), which broke every failed sign-in.
      credentials: 'omit',
      signal: controller.signal,
    })
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: downstreamResponseHeaders(upstream.headers) })
  } catch (error) {
    return failureResponse(request, error, isTimeout(error, () => timedOut))
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', abort)
  }
}
