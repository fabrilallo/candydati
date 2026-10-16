import { careersPageDocumentSchema, careersPageFixture, CAREERS_FIXTURE_MEDIA, defaultCareersPage, type CareersMediaDto, type PublicCareersPageDto } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { careersPageSeo } from './careers-seo'

const PATH = `/api/v1/public/organizations/acme/careers-media/${CAREERS_FIXTURE_MEDIA.poster}`
const poster: CareersMediaDto = {
  id: CAREERS_FIXTURE_MEDIA.poster,
  kind: 'image',
  mime: 'image/webp',
  width: 1920,
  height: 1080,
  url: `${PATH}/aaaaaaaaaaaaaaaa-w1920.webp`,
  variants: [{ width: 1920, url: `${PATH}/aaaaaaaaaaaaaaaa-w1920.webp` }],
}
const organization = { name: 'Acme </script>', slug: 'acme', logo: 'https://cdn.example/logo.png' }
const options = { locale: 'en' as const, siteUrl: 'https://jobs.example', fallbackTitle: 'Open positions at Acme', fallbackDescription: 'Fallback description' }

describe('careersPageSeo', () => {
  it('takes title and description from the hero, og:image from its media, links as sameAs', () => {
    const site: PublicCareersPageDto = { organization, page: careersPageDocumentSchema.parse(careersPageFixture()), media: { [poster.id]: poster }, publishedAt: null }
    const seo = careersPageSeo(site, options)
    expect(seo.title).toBe('We build software that matters')
    expect(seo.description).toBe('Trenta persone, una sede a Bologna, tanto lavoro da remoto.')
    expect(seo.image).toBe(`https://jobs.example${poster.url}`)
    const data = JSON.parse(seo.jsonLd) as Record<string, unknown>
    expect(data).toMatchObject({ '@type': 'Organization', name: 'Acme </script>', url: 'https://jobs.example/careers/acme', logo: 'https://cdn.example/logo.png', image: seo.image })
    expect(data.sameAs).toEqual(['https://www.linkedin.com/company/example', 'https://example.com'])
    expect(seo.jsonLd).not.toContain('</script>')
  })

  it('falls back to the default texts and no image', () => {
    const site: PublicCareersPageDto = { organization: { ...organization, logo: 'javascript:alert(1)' }, page: { ...defaultCareersPage('Acme'), sections: [{ id: 'jobs', type: 'jobs', visible: true, title: {}, intro: {} }] }, media: {}, publishedAt: null }
    const seo = careersPageSeo(site, options)
    expect(seo).toMatchObject({ title: 'Open positions at Acme', description: 'Fallback description', image: null })
    expect(JSON.parse(seo.jsonLd)).not.toHaveProperty('logo')
  })

  it('keeps the description short', () => {
    const page = defaultCareersPage('Acme')
    const hero = { ...page.sections[0]!, subheadline: { en: 'word '.repeat(80) } } as (typeof page.sections)[number]
    const seo = careersPageSeo({ organization, page: { ...page, sections: [hero, page.sections[1]!] }, media: {}, publishedAt: null }, options)
    expect(seo.description.length).toBeLessThanOrEqual(160)
  })
})
