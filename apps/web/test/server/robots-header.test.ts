import { describe, expect, it } from 'vitest'
import { NOINDEX, wantsRobotsHeader } from '~~/server/middleware/robots-header'

describe('robots header middleware', () => {
  it('labels every page as noindex', () => {
    expect(NOINDEX).toBe('noindex, nofollow')
    expect(wantsRobotsHeader('/')).toBe(true)
    expect(wantsRobotsHeader('/dashboard/career-map')).toBe(true)
    expect(wantsRobotsHeader('/robots.txt')).toBe(true)
  })

  it('lets the public careers pages be indexed', () => {
    expect(wantsRobotsHeader('/careers/acme')).toBe(false)
    expect(wantsRobotsHeader('/careers/acme/backend-1')).toBe(false)
    expect(wantsRobotsHeader('/careersx')).toBe(true)
    expect(wantsRobotsHeader('/app/careers/x')).toBe(true)
  })

  it('leaves the api proxy and the immutable assets alone', () => {
    expect(wantsRobotsHeader('/api/me')).toBe(false)
    expect(wantsRobotsHeader('/_nuxt/entry.js')).toBe(false)
    expect(wantsRobotsHeader('/_fonts/inter.woff2')).toBe(false)
  })
})
