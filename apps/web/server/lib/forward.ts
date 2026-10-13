import { defineEventHandler, getRequestURL, readRawBody } from 'h3'
import { proxyToApi } from './api-proxy'

/**
 * A route that forwards matching requests to the Fastify api (`NUXT_API_INTERNAL_URL`, read at runtime), body and
 * headers included. Used for `/api/**` (cookies stay first-party) and `/mcp` (bearer keys, no cookies).
 */
export const forwardToApi = (matches: (pathWithQuery: string) => boolean) =>
  defineEventHandler(async (event) => {
    const url = getRequestURL(event, { xForwardedProto: true })
    const pathWithQuery = `${url.pathname}${url.search}`
    if (!matches(pathWithQuery)) return

    const body = event.method === 'GET' || event.method === 'HEAD' ? undefined : await readRawBody(event, false)
    const { apiInternalUrl } = useRuntimeConfig(event)
    return proxyToApi(
      apiInternalUrl,
      {
        method: event.method,
        pathWithQuery,
        headers: new Headers(event.headers),
        body: body ?? undefined,
        host: url.host,
        protocol: url.protocol === 'https:' ? 'https' : 'http',
      },
      (input, init) => fetch(input, init),
    )
  })
