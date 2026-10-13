/**
 * The client IP the api rate-limits on, computed in one place for the api proxy and for every server-side call the
 * web app itself makes (SSR). Pure (no `node:net`, no h3) so it also type-checks in app code.
 */

export interface ClientIpSource {
  readonly headers: Pick<Headers, 'get'>
  /** Address of the TCP peer that connected to the web server (the socket), the only address that cannot be forged. */
  readonly socketAddress?: string | undefined
  /** `NUXT_TRUST_CLOUDFLARE=true`: the web runs behind Cloudflare and only Cloudflare can reach it, so its `cf-connecting-ip` is the client. */
  readonly trustCloudflare?: boolean | undefined
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

const isIpv6 = (value: string): boolean => {
  if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return false
  try {
    return new URL(`http://[${value}]/`).hostname !== ''
  } catch {
    return false
  }
}

/** `::ffff:203.0.113.7` (an IPv4 peer seen on a dual-stack socket) is the same client as `203.0.113.7`. */
export const normalizeIp = (address: string | undefined): string | null => {
  const value = address?.trim().replace(/^::ffff:/i, '') ?? ''
  return IPV4.test(value) || isIpv6(value) ? value : null
}

/** The socket address, or, only when the deploy says the web sits behind Cloudflare, the `cf-connecting-ip` it set. A client-sent header is never used. */
export const clientIpOf = (source: ClientIpSource): string | null =>
  (source.trustCloudflare ? normalizeIp(source.headers.get('cf-connecting-ip') ?? undefined) : null) ?? normalizeIp(source.socketAddress)

/** The single clean `x-forwarded-for` for an upstream call, empty when the client is unknown. */
export const forwardedForHeader = (source: ClientIpSource): Record<string, string> => {
  const ip = clientIpOf(source)
  return ip ? { 'x-forwarded-for': ip } : {}
}
