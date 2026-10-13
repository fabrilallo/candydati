import { forwardedForHeader, type ClientIpSource } from './client-ip'

export interface SsrHeaderInput extends ClientIpSource {
  readonly cookie?: string | undefined
  /** Public host and protocol of the web origin, as the proxy forwards them. */
  readonly host: string
  readonly protocol: 'http' | 'https'
}

/** Headers of a server-side call from the web app to the api: the viewer's cookie, one clean `x-forwarded-for`, the public host and protocol. */
export const ssrApiHeaders = (input: SsrHeaderInput): Record<string, string> => ({
  ...(input.cookie ? { cookie: input.cookie } : {}),
  ...forwardedForHeader(input),
  'x-forwarded-host': input.host,
  'x-forwarded-proto': input.protocol,
})
