import { httpUrlOrNull, isMediaFileName } from '@candydati/domain'

/** Only an http(s) address becomes a link: stored data can hold anything (`javascript:` is script on our origin). */
export const safeExternalUrl = (url: string | null | undefined): string | null => httpUrlOrNull(url)

/** A file of an organization's public media route: the only same-origin address a logo may point to. */
const PUBLIC_MEDIA_PATH = /^\/api\/v1\/public\/organizations\/[^/?#]+\/careers-media\/[0-9a-zA-Z-]+\/([^/?#]+)$/

const isMediaFile = (encoded: string): boolean => {
  try {
    return isMediaFileName(decodeURIComponent(encoded))
  } catch {
    return false
  }
}

/** An organization logo comes from data: an https address, or an image of its library on the public media route. */
export const safeLogoUrl = (url: string | null | undefined): string | null => {
  const external = httpUrlOrNull(url, { httpsOnly: true })
  if (external || !url) return external
  const name = PUBLIC_MEDIA_PATH.exec(url)?.[1]
  return name !== undefined && isMediaFile(name) ? url : null
}

/** The logo for what is read elsewhere (og:image, JSON-LD): a library image gets the site's address in front. */
export const absoluteLogoUrl = (siteUrl: string, url: string | null | undefined): string | null => {
  const safe = safeLogoUrl(url)
  return safe?.startsWith('/') ? `${siteUrl.replace(/\/$/, '')}${safe}` : safe
}
