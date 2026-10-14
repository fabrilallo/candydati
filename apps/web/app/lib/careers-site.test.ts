import { careersPageDocumentSchema, careersPageFixture, contrastRatio, DEFAULT_CAREERS_THEME, type CareersMediaDto } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { absoluteMediaUrl, hasHero, headingFontFamily, imageSources, mediaOf, safeEmbedUrl, safeMediaUrl, textIn, themeStyle, watchUrl } from './careers-site'

const PATH = '/api/v1/public/organizations/acme/careers-media/11111111-1111-4111-8111-111111111111'
const image: CareersMediaDto = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'image',
  mime: 'image/webp',
  width: 1920,
  height: 1280,
  url: `${PATH}/aaaaaaaaaaaaaaaa-w1920.webp`,
  variants: [
    { width: 640, url: `${PATH}/aaaaaaaaaaaaaaaa-w640.webp` },
    { width: 1920, url: `${PATH}/aaaaaaaaaaaaaaaa-w1920.webp` },
  ],
}

describe('themeStyle', () => {
  it('exposes the accent, its readable foreground and the ink of each theme as variables', () => {
    const style = themeStyle(DEFAULT_CAREERS_THEME)
    expect(style['--cp-accent']).toBe('#1f47d6')
    expect(contrastRatio(style['--cp-accent']!, style['--cp-accent-fg']!)).toBeGreaterThanOrEqual(4.5)
    expect(style['--cp-ink-dark']).not.toBe(style['--cp-ink-light'])
    expect(style['--cp-heading-font']).toContain('Geist')
    expect(style['--cp-radius']).toBe('1.25rem')
  })

  it('switches corners and heading weight with the theme', () => {
    const style = themeStyle({ accent: '#0b6e4f', headingFont: 'fraunces', corners: 'sharp' })
    expect(style['--cp-radius']).toBe('0.125rem')
    expect(style['--cp-heading-weight']).toBe('500')
    expect(headingFontFamily('newsreader')).toContain('Newsreader')
    expect(headingFontFamily('bricolage')).toContain('Bricolage')
  })
})

describe('textIn', () => {
  it('reads the visitor language with the page default as fallback', () => {
    const tx = textIn('en', { defaultLocale: 'it' })
    expect(tx({ it: 'Ciao', en: 'Hi' })).toBe('Hi')
    expect(tx({ it: 'Ciao' })).toBe('Ciao')
    expect(tx(undefined)).toBe('')
  })
})

describe('safe media addresses', () => {
  it('accepts only our own media routes and file names', () => {
    expect(safeMediaUrl(image.url)).toBe(image.url)
    const editorPath = '/api/v1/careers-page/media/11111111-1111-4111-8111-111111111111/files/aaaaaaaaaaaaaaaa-w640.webp'
    expect(safeMediaUrl(editorPath)).toBe(editorPath)
    expect(safeMediaUrl('/api/v1/careers-page/media/x/files/../../secret')).toBeNull()
    for (const url of ['https://evil.example/x.webp', 'javascript:alert(1)', `${PATH}/../../x`, `${PATH}/x.svg`, '//evil.example/api/v1/public/organizations/a/careers-media/b/aaaaaaaaaaaaaaaa.mp4', null, undefined, '']) {
      expect(safeMediaUrl(url)).toBeNull()
    }
  })

  it('builds src and srcset from the variants, and nothing for videos or tampered addresses', () => {
    expect(imageSources(image)).toEqual({ src: image.url, srcset: `${PATH}/aaaaaaaaaaaaaaaa-w640.webp 640w, ${PATH}/aaaaaaaaaaaaaaaa-w1920.webp 1920w`, width: 1920, height: 1280 })
    expect(imageSources({ ...image, kind: 'video' })).toBeNull()
    expect(imageSources({ ...image, url: 'https://evil.example/a.webp' })).toBeNull()
    expect(imageSources({ ...image, variants: [{ width: 1, url: 'javascript:x' }] })?.srcset).toBe('')
    expect(imageSources(undefined)).toBeNull()
  })

  it('finds media by id', () => {
    expect(mediaOf({ [image.id]: image }, image.id)).toBe(image)
    expect(mediaOf({}, undefined)).toBeUndefined()
  })

  it('makes an absolute address for og:image', () => {
    expect(absoluteMediaUrl('https://jobs.example/', '/api/x')).toBe('https://jobs.example/api/x')
    expect(absoluteMediaUrl('https://jobs.example', null)).toBeNull()
  })
})

describe('external videos', () => {
  it('builds privacy-friendly players and watch links from the id', () => {
    expect(safeEmbedUrl({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' })).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(safeEmbedUrl({ kind: 'vimeo', videoId: '123' })).toContain('https://player.vimeo.com/video/123')
    expect(safeEmbedUrl({ kind: 'upload', videoId: image.id, posterId: image.id })).toBeNull()
    expect(watchUrl({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' })).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(watchUrl({ kind: 'upload', videoId: image.id, posterId: image.id })).toBeNull()
  })
})

describe('hasHero', () => {
  it('is true only with a visible hero', () => {
    const page = careersPageDocumentSchema.parse(careersPageFixture())
    expect(hasHero(page)).toBe(true)
    expect(hasHero({ ...page, sections: page.sections.map((section) => ({ ...section, visible: section.type !== 'hero' })) })).toBe(false)
  })
})
