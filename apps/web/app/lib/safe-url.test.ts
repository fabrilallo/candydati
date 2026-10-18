import { describe, expect, it } from 'vitest'
import { absoluteLogoUrl, safeExternalUrl, safeLogoUrl } from './safe-url'

describe('safeExternalUrl', () => {
  it('keeps http(s) and drops everything else', () => {
    expect(safeExternalUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(safeExternalUrl('http://a.example/x')).toBe('http://a.example/x')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,x')).toBeNull()
    expect(safeExternalUrl('nope')).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
  })
})

const LIBRARY_LOGO = '/api/v1/public/organizations/acme/careers-media/11111111-1111-4111-8111-111111111111/0123456789abcdef-w640.webp'

describe('safeLogoUrl', () => {
  it('is an https address', () => {
    expect(safeLogoUrl('https://a.example/l.png')).toBe('https://a.example/l.png')
    expect(safeLogoUrl('http://a.example/l.png')).toBeNull()
    expect(safeLogoUrl('javascript:alert(1)')).toBeNull()
  })

  it('or a file of the public media route, nothing else on our origin', () => {
    expect(safeLogoUrl(LIBRARY_LOGO)).toBe(LIBRARY_LOGO)
    expect(safeLogoUrl('/api/v1/public/organizations/acme/careers-media/x/../../../../auth/sign-out')).toBeNull()
    expect(safeLogoUrl('/api/v1/careers-page/media/x/files/0123456789abcdef-w640.webp')).toBeNull()
    expect(safeLogoUrl('//evil.example/l.png')).toBeNull()
    expect(safeLogoUrl('/api/v1/public/organizations/acme/careers-media/x/%E0%A4%A')).toBeNull()
  })
})

describe('absoluteLogoUrl', () => {
  it('puts the site in front of a library logo, for pages read elsewhere', () => {
    expect(absoluteLogoUrl('https://jobs.example/', LIBRARY_LOGO)).toBe(`https://jobs.example${LIBRARY_LOGO}`)
    expect(absoluteLogoUrl('https://jobs.example', 'https://a.example/l.png')).toBe('https://a.example/l.png')
    expect(absoluteLogoUrl('https://jobs.example', 'javascript:alert(1)')).toBeNull()
    expect(absoluteLogoUrl('https://jobs.example', null)).toBeNull()
  })
})
