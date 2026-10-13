import type { PublicJobPageDto, PublishedJobContent } from '@tt/domain'
import { jobContentSchema } from '@tt/domain'
import { describe, expect, it } from 'vitest'
import { translatorFor } from '~~/test/fixtures/ad-translate'
import { adHeadings, buildJobSeo } from './job-seo'

const build = (page: PublicJobPageDto, siteUrl: string) => buildJobSeo(page, siteUrl, translatorFor(page.job.content.language))

const content = jobContentSchema.parse({
  title: 'Backend developer',
  language: 'en',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 45000, max: 60000 },
  workMode: 'remote',
  location: { country: 'IT' },
  process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }],
  responseDays: 5,
  responsibilities: ['a', 'b', 'c'],
  requirements: { mustHave: ['x'] },
}) as PublishedJobContent

const page = (overrides: Partial<PublishedJobContent> = {}, logo: string | null = null): PublicJobPageDto => ({
  organization: { name: 'Acme', slug: 'acme', logo },
  job: { slug: 'backend-1', content: { ...content, ...overrides }, publishedAt: '2026-10-13T10:00:00.000Z' },
})

describe('buildJobSeo', () => {
  it('builds canonical, title and a description from the summary', () => {
    const seo = build(page({ summary: 'We build   the\nplatform.' }), 'https://jobs.example.com/')
    expect(seo.canonical).toBe('https://jobs.example.com/careers/acme/backend-1')
    expect(seo.title).toBe('Backend developer | Acme')
    expect(seo.description).toBe('We build the platform.')
    expect(seo.locale).toBe('en')
    expect(seo.image).toBeNull()
  })

  it('falls back to a generated description in the language of the ad', () => {
    expect(build(page(), 'https://x.test').description).toBe('Backend developer: Backend developer, Senior, Permanent. €45,000 - €60,000, gross per year.')
    expect(build(page({ language: 'it' }), 'https://x.test').description).toContain('Tempo indeterminato')
  })

  it('clips a long summary', () => {
    const seo = build(page({ summary: 'word '.repeat(100) }), 'https://x.test')
    expect(seo.description.length).toBeLessThanOrEqual(155)
    expect(seo.description.endsWith('…')).toBe(true)
  })

  it('serialises JobPosting JSON-LD that cannot close the script tag', () => {
    const seo = build(page({ title: 'Dev </script><b>' }, 'https://cdn.test/logo.png'), 'https://x.test')
    expect(seo.jsonLd).not.toContain('</script>')
    const data = JSON.parse(seo.jsonLd) as Record<string, unknown>
    expect(data['@type']).toBe('JobPosting')
    expect(data.url).toBe(seo.canonical)
    expect(data.inLanguage).toBe('en')
    expect(JSON.stringify(data.description)).toContain('What you will do')
    expect(seo.image).toBe('https://cdn.test/logo.png')
  })
})

describe('adHeadings', () => {
  it('uses the language of the ad', () => {
    expect(adHeadings(translatorFor('it')).responsibilities).toBe('Cosa farai')
    expect(adHeadings(translatorFor('en')).culture).toBe('Culture and values')
  })
})
