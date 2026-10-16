import {
  careersThemeTokens,
  externalEmbedUrl,
  externalWatchUrl,
  isMediaFileName,
  resolveText,
  type CareersMediaDto,
  type CareersPageDocument,
  type CareersTheme,
  type HeadingFont,
  type Locale,
  type LocalizedText,
  type VideoSource,
} from '@candydati/domain'

/**
 * Pure helpers of the public careers page and its live preview: theme variables, the visitor's text, responsive
 * image sources. Every address bound in a template comes from here and is checked (same-origin media paths only).
 */

const FONT_FAMILIES: Readonly<Record<HeadingFont, string>> = {
  geist: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  fraunces: "'Fraunces Variable', ui-serif, Georgia, serif",
  bricolage: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif",
  newsreader: "'Newsreader Variable', ui-serif, Georgia, serif",
}

/** Serif faces read better a touch lighter and less tight than Geist at display sizes. */
const SERIF: ReadonlySet<HeadingFont> = new Set(['fraunces', 'newsreader'])

export const headingFontFamily = (font: HeadingFont): string => FONT_FAMILIES[font]

/** CSS custom properties scoped to the page (`.careers-site`): accent fill and text, ink per theme, font, corners. */
export const themeStyle = (theme: CareersTheme): Readonly<Record<string, string>> => {
  const tokens = careersThemeTokens(theme)
  const soft = theme.corners === 'soft'
  return {
    '--cp-accent': tokens.accent,
    '--cp-accent-fg': tokens.accentForeground,
    '--cp-ink-light': tokens.inkLight,
    '--cp-ink-dark': tokens.inkDark,
    '--cp-heading-font': headingFontFamily(theme.headingFont),
    '--cp-heading-weight': SERIF.has(theme.headingFont) ? '500' : '600',
    '--cp-heading-tracking': SERIF.has(theme.headingFont) ? '-0.015em' : '-0.035em',
    '--cp-radius': soft ? '1.25rem' : '0.125rem',
    '--cp-radius-sm': soft ? '0.75rem' : '0.125rem',
    '--cp-radius-control': soft ? '9999px' : '0.125rem',
  }
}

/** The visitor's text: their language, else the page's default language, else whatever was written. */
export const textIn = (locale: Locale, page: Pick<CareersPageDocument, 'defaultLocale'>) => (text: LocalizedText | undefined): string =>
  resolveText(text, locale, page.defaultLocale)

/** The public route (files of the published page) and the editor's private one (the library, the draft preview). */
const MEDIA_PATHS = [
  /^\/api\/v1\/public\/organizations\/[^/?#]+\/careers-media\/[0-9a-zA-Z-]+\/([^/?#]+)$/,
  /^\/api\/v1\/careers-page\/media\/[0-9a-zA-Z-]+\/files\/([^/?#]+)$/,
]

/** A media address only when it is one of ours (same origin, one of the media routes, a name we produce). */
export const safeMediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  const name = MEDIA_PATHS.map((pattern) => pattern.exec(url)?.[1]).find((match) => match !== undefined)
  return name !== undefined && isMediaFileName(decodeURIComponent(name)) ? url : null
}

export interface ImageSources {
  readonly src: string
  readonly srcset: string
  readonly width: number | null
  readonly height: number | null
}

/** `src` (the widest variant) and `srcset` of an image, or null when it is missing or not one of ours. */
export const imageSources = (media: CareersMediaDto | undefined): ImageSources | null => {
  if (!media || media.kind !== 'image') return null
  const variants = media.variants.flatMap((variant) => {
    const url = safeMediaUrl(variant.url)
    return url ? [`${url} ${variant.width}w`] : []
  })
  const src = safeMediaUrl(media.url)
  return src ? { src, srcset: variants.join(', '), width: media.width, height: media.height } : null
}

export const mediaOf = (media: Readonly<Record<string, CareersMediaDto>>, id: string | undefined): CareersMediaDto | undefined => (id ? media[id] : undefined)

/** The player address of an external video (privacy-friendly host), or null for a tampered id. */
export const safeEmbedUrl = (source: VideoSource): string | null =>
  source.kind === 'upload' ? null : externalEmbedUrl({ provider: source.kind, videoId: source.videoId })

export const watchUrl = (source: VideoSource): string | null =>
  source.kind === 'upload' ? null : externalWatchUrl({ provider: source.kind, videoId: source.videoId })

/** Anchor of the open positions: the hero's call to action scrolls there. */
export const JOBS_ANCHOR = 'posizioni'

/** Whether the page opens with a visible hero (otherwise the page renders a plain title as its `h1`). */
export const hasHero = (page: CareersPageDocument): boolean => page.sections.some((section) => section.type === 'hero' && section.visible)

/** Absolute URL of an image for `og:image`, from the site URL and a same-origin path. */
export const absoluteMediaUrl = (siteUrl: string, path: string | null): string | null => (path ? `${siteUrl.replace(/\/$/, '')}${path}` : null)
