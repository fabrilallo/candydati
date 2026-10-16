import { defineEventHandler, getRequestURL, getRequestWebStream } from 'h3'
import { publicOriginOf } from '../../app/lib/public-origin'
import { DEFAULT_MAX_BODY_BYTES, DEFAULT_TIMEOUT_MS, proxyToApi } from './api-proxy'

/**
 * A route that forwards matching requests to the Fastify api (`NUXT_API_INTERNAL_URL`, read at runtime), body and
 * headers included. Used for `/api/**` (cookies stay first-party) and `/mcp` (bearer keys, no cookies).
 */
export const forwardToApi = (matches: (pathWithQuery: string) => boolean) =>
  defineEventHandler(async (event) => {
    // Host and protocol come from the connection itself (never the client's `X-Forwarded-*`), then from the configured site URL below.
    const url = getRequestURL(event, { xForwardedProto: false, xForwardedHost: false })
    const pathWithQuery = `${url.pathname}${url.search}`
    if (!matches(pathWithQuery)) return

    const body = event.method === 'GET' || event.method === 'HEAD' ? undefined : (getRequestWebStream(event) ?? undefined)
    const { apiInternalUrl, trustCloudflare, trustedProxy, apiMaxBodyBytes, apiTimeoutMs, public: site } = useRuntimeConfig(event)
    const origin = publicOriginOf(String(site?.siteUrl ?? ''), { host: url.host, protocol: url.protocol === 'https:' ? 'https' : 'http' })
    // Browser went away before the api answered: stop the upstream call too.
    const clientGone = new AbortController()
    event.node.res.once('close', () => {
      if (!event.node.res.writableEnded) clientGone.abort()
    })
    return proxyToApi(
      apiInternalUrl,
      {
        method: event.method,
        pathWithQuery,
        headers: new Headers(event.headers),
        body,
        maxBodyBytes: Number(apiMaxBodyBytes) || DEFAULT_MAX_BODY_BYTES,
        timeoutMs: Number(apiTimeoutMs) || DEFAULT_TIMEOUT_MS,
        signal: clientGone.signal,
        host: origin.host,
        protocol: origin.protocol,
        socketAddress: event.node.req.socket.remoteAddress,
        trustCloudflare,
        trustedProxy,
      },
      (input, init) => fetch(input, init),
    )
  })
