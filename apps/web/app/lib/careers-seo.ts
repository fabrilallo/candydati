import { serializeJsonLd, type Locale, type PublicCareersPageDto } from '@tt/domain'
import { absoluteMediaUrl, imageSources, mediaOf, textIn } from './careers-site'
import { safeExternalUrl, safeImageUrl } from './safe-url'

export interface CareersSeo {
  readonly title: string
  readonly description: string
  /** Absolute address of the hero image (or the poster of the hero video), for `og:image`. */
  readonly image: string | null
  /** `Organization` structured data, `<` escaped (it is written inside a script tag). */
  readonly jsonLd: string
}

export interface CareersSeoOptions {
  readonly locale: Locale
  readonly siteUrl: string
  readonly fallbackTitle: string
  readonly fallbackDescription: string
}

const DESCRIPTION_MAX = 160

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** Title and description from the hero (else the defaults), og:image from its media, JSON-LD `Organization`. */
export const careersPageSeo = (site: PublicCareersPageDto, options: CareersSeoOptions): CareersSeo => {
  const tx = textIn(options.locale, site.page)
  const hero = site.page.sections.find((section) => section.type === 'hero')
  const background = hero?.type === 'hero' ? hero.background : null
  const imageId = background?.kind === 'image' ? background.imageId : background?.kind === 'video' ? background.posterId : undefined
  const sources = imageSources(mediaOf(site.media, imageId))
  const image = absoluteMediaUrl(options.siteUrl, sources?.src ?? null)
  const title = (hero?.type === 'hero' && tx(hero.headline)) || options.fallbackTitle
  const description = clip(((hero?.type === 'hero' && tx(hero.subheadline)) || options.fallbackDescription).replace(/\s+/g, ' '), DESCRIPTION_MAX)
  const sameAs = site.page.sections.flatMap((section) => (section.type === 'links' ? section.items.map((item) => safeExternalUrl(item.url)).filter((url): url is string => url !== null) : []))
  const logo = safeImageUrl(site.organization.logo)
  const jsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.organization.name,
    url: `${options.siteUrl.replace(/\/$/, '')}/careers/${encodeURIComponent(site.organization.slug)}`,
    ...(logo ? { logo } : {}),
    ...(image ? { image } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  })
  return { title, description, image, jsonLd }
}
