import { describe, expect, it } from 'vitest'
import { DEFAULT_FAVICON, faviconLink } from './favicon'

describe('faviconLink', () => {
  it('uses the platform mark when nothing else is given', () => {
    expect(faviconLink(null)).toEqual({ key: 'icon', rel: 'icon', href: DEFAULT_FAVICON, type: 'image/svg+xml' })
    expect(faviconLink('')).toEqual(faviconLink(null))
  })

  it('uses a configured icon or an organization logo, https or from the media library', () => {
    expect(faviconLink('https://cdn.example.com/brand.png')).toEqual({ key: 'icon', rel: 'icon', href: 'https://cdn.example.com/brand.png' })
    expect(faviconLink('/api/v1/public/organizations/acme/careers-media/m1/0123456789abcdef-w640.webp')).toMatchObject({ href: '/api/v1/public/organizations/acme/careers-media/m1/0123456789abcdef-w640.webp' })
  })

  it('falls back to the platform mark for an unsafe address', () => {
    for (const url of ['http://example.com/x.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>']) {
      expect(faviconLink(url).href, url).toBe(DEFAULT_FAVICON)
    }
  })
})
