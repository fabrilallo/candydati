import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8')
const rules = robots.split('\n').filter((line) => /^(Allow|Disallow):/.test(line))

describe('robots.txt', () => {
  // Ads shared with ?utm_source= or ?ref= (origin of applications) must not become new crawlable URLs.
  it('keeps every query-string URL out of crawling, careers pages included', () => {
    expect(rules).toContain('Disallow: /careers/*?')
    expect(rules).toContain('Disallow: /*?')
  })

  it('keeps the app and the api out', () => {
    expect(rules).toEqual(expect.arrayContaining(['Disallow: /app/', 'Disallow: /api/', 'Disallow: /__nuxt_island/']))
  })
})
