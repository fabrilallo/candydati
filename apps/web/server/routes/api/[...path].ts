import { defineEventHandler, getRequestURL, readRawBody } from 'h3'
import { isApiPath, proxyToApi } from '../../lib/api-proxy'

/**
 * `/api/**` on the web origin, forwarded to the Fastify api (`NUXT_API_INTERNAL_URL`, read at runtime):
 * the browser only ever talks to this origin, so Better Auth cookies stay first-party.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event, { xForwardedProto: true })
  const pathWithQuery = `${url.pathname}${url.search}`
  if (!isApiPath(pathWithQuery)) return

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
