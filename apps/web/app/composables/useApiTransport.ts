import { publicOriginOf } from '@/lib/public-origin'
import { ssrApiHeaders } from '@/lib/ssr-headers'

export interface ApiTransport {
  readonly baseURL: string | undefined
  readonly headers: Record<string, string>
}

/**
 * Where and how the web app calls the api. In the browser: same origin, the session cookie travels by itself. During SSR
 * the call goes straight to the api (`apiInternalUrl`) and carries the incoming cookie plus the real client IP as one clean
 * `x-forwarded-for` (same function as the proxy), so users do not share the loopback rate-limit bucket.
 */
export const useApiTransport = (): ApiTransport => {
  if (!import.meta.server) return { baseURL: undefined, headers: {} }
  const { apiInternalUrl, trustCloudflare, trustedProxy, public: site } = useRuntimeConfig()
  const url = useRequestURL()
  const origin = publicOriginOf(site.siteUrl, { host: url.host, protocol: url.protocol === 'https:' ? 'https' : 'http' })
  return {
    baseURL: apiInternalUrl,
    headers: ssrApiHeaders({
      cookie: useRequestHeaders(['cookie']).cookie,
      headers: new Headers(useRequestHeaders(['cf-connecting-ip', 'x-forwarded-for'])),
      socketAddress: useRequestEvent()?.node.req.socket.remoteAddress,
      trustCloudflare,
      trustedProxy,
      host: origin.host,
      protocol: origin.protocol,
    }),
  }
}
