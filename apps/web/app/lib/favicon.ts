import { safeLogoUrl } from './safe-url'

/** The platform mark in `public/`: a deployment replaces it with `NUXT_PUBLIC_PLATFORM_ICON_URL`. */
export const DEFAULT_FAVICON = '/favicon.svg'

/**
 * A head `link` entry. A type alias, not an interface: unhead's link type has an index signature (`data-*`) that only
 * aliases satisfy. `key` keeps one icon per page: a careers page's logo replaces the platform's.
 */
export type FaviconLink = {
  key: 'icon'
  rel: 'icon'
  href: string
  type?: 'image/svg+xml'
}

/** The tab icon: the given address when it is a safe logo (https or the media library), else the platform mark. */
export function faviconLink(url: string | null | undefined): FaviconLink {
  const safe = safeLogoUrl(url)
  return safe ? { key: 'icon', rel: 'icon', href: safe } : { key: 'icon', rel: 'icon', href: DEFAULT_FAVICON, type: 'image/svg+xml' }
}
