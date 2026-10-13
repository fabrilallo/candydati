import { defineEventHandler, getRouterParam } from 'h3'
import { serveDoc, type DocKind } from './distribution-docs'

/** A Nitro route for one document of `/careers/{org}/…`; `[org]` is the organization slug. */
export const distributionRoute = (kind: DocKind) =>
  defineEventHandler((event) => {
    const org = getRouterParam(event, 'org') ?? ''
    const config = useRuntimeConfig(event)
    return serveDoc(kind, org, {
      apiOrigin: config.apiInternalUrl,
      siteUrl: config.public.siteUrl,
      locale: config.public.platformDefaultLocale,
      fetch: (input, init) => fetch(input, init),
    })
  })
