export interface PublicOrigin {
  readonly host: string
  readonly protocol: 'http' | 'https'
}

/**
 * The origin the api is told the browser used (`x-forwarded-host` / `x-forwarded-proto`). It comes from the configured
 * site URL, never from the incoming request's own `X-Forwarded-*` or `Host` headers: those are the client's to forge.
 * `fallback` (what the TCP connection itself shows) is used only when no site URL is configured.
 */
export const publicOriginOf = (siteUrl: string, fallback: PublicOrigin): PublicOrigin => {
  try {
    const url = new URL(siteUrl)
    if (url.protocol === 'https:' || url.protocol === 'http:') return { host: url.host, protocol: url.protocol === 'https:' ? 'https' : 'http' }
  } catch {
    // not a URL: use the fallback below
  }
  return fallback
}
