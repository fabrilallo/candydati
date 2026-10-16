import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  CAREERS_FIXTURE_MEDIA as M,
  careersPageDocumentSchema,
  careersPageFixture,
  defaultCareersPage,
  type CareersMediaDto,
  type CareersPageDocument,
  type PublicCareersDto,
  type PublicJobSummaryDto,
} from '@candydati/domain'
import { afterEach, describe, expect, it } from 'vitest'
import CareersSite from './CareersSite.vue'

const path = (id: string, name: string) => `/api/v1/public/organizations/acme/careers-media/${id}/${name}`
const image = (id: string): CareersMediaDto => ({
  id,
  kind: 'image',
  mime: 'image/webp',
  width: 1920,
  height: 1280,
  url: path(id, 'aaaaaaaaaaaaaaaa-w1920.webp'),
  variants: [
    { width: 640, url: path(id, 'aaaaaaaaaaaaaaaa-w640.webp') },
    { width: 1920, url: path(id, 'aaaaaaaaaaaaaaaa-w1920.webp') },
  ],
})
const MEDIA: Record<string, CareersMediaDto> = {
  [M.image]: image(M.image),
  [M.image2]: image(M.image2),
  [M.poster]: image(M.poster),
  [M.video]: { id: M.video, kind: 'video', mime: 'video/mp4', width: null, height: null, url: path(M.video, 'bbbbbbbbbbbbbbbb.mp4'), variants: [] },
}
const job: PublicJobSummaryDto = {
  slug: 'backend-1',
  title: 'Backend developer',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  workMode: 'remote',
  location: { country: 'IT' },
  salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
  stageCount: 3,
  responseDays: 5,
  publishedAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:00:00.000Z',
}
const careers = (jobs: PublicJobSummaryDto[] = [job]): PublicCareersDto => ({ organization: { name: 'Acme', slug: 'acme', logo: 'https://cdn.test/l.png' }, jobs })

const mounted: { unmount: () => void }[] = []
const mountSite = async (page: CareersPageDocument, props: Partial<{ media: Record<string, CareersMediaDto>; careers: PublicCareersDto; mode: 'public' | 'preview' }> = {}) => {
  const wrapper = await mountSuspended(CareersSite, { props: { page, media: MEDIA, careers: careers(), ...props } })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

const fixture = careersPageDocumentSchema.parse(careersPageFixture())

describe('CareersSite', () => {
  it('renders every visible section of the document, in order, with the hero as the only h1', async () => {
    const wrapper = await mountSite(fixture)
    const ids = ['site-hero', 'site-text', 'site-image-text', 'site-gallery', 'site-video', 'site-values', 'site-numbers', 'site-testimonials', 'site-jobs', 'site-links']
    const order = wrapper.findAll('[data-testid^="site-"]').map((node) => node.attributes('data-testid')).filter((id) => ids.includes(id ?? ''))
    expect(order).toEqual(ids)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('Costruiamo software che conta')
  })

  it('scopes the theme as CSS variables and shows the organization in its bar', async () => {
    const wrapper = await mountSite(fixture)
    const style = wrapper.find('[data-testid="careers-site"]').attributes('style') ?? ''
    expect(style).toContain('--cp-accent: #0b6e4f')
    expect(style).toContain('Fraunces')
    expect(wrapper.find('[data-testid="site-topbar"] img').attributes('alt')).toBe('Logo di Acme')
    expect(wrapper.find('header [data-testid="site-topbar"]').exists()).toBe(true)
    expect(wrapper.find('main#main').exists()).toBe(true)
  })

  it('reads the visitor language with the default language as fallback', async () => {
    const wrapper = await mountSite(fixture)
    // Only Italian was written for the gallery title; both for the hero.
    expect(wrapper.find('[data-testid="site-gallery"] h2').text()).toBe('Una giornata da noi')
  })

  it('leaves hidden sections out', async () => {
    const page = { ...fixture, sections: fixture.sections.map((section) => (section.type === 'values' ? { ...section, visible: false } : section)) }
    const wrapper = await mountSite(page)
    expect(wrapper.find('[data-testid="site-values"]').exists()).toBe(false)
  })

  it('shows the hero poster as a responsive, high-priority image and a pausable muted background video', async () => {
    const wrapper = await mountSite(fixture)
    const hero = wrapper.find('[data-testid="site-hero-image"]')
    expect(hero.attributes('fetchpriority')).toBe('high')
    expect(hero.attributes('srcset')).toContain('640w')
    expect(hero.attributes('alt')).toBe('')
    const video = wrapper.find('[data-testid="site-hero-video"]')
    expect(video.attributes('muted')).toBeDefined()
    expect(video.attributes('autoplay')).toBeUndefined()
    expect(video.find('source').attributes('src')).toBe(MEDIA[M.video]!.url)
    expect(wrapper.find('[data-testid="site-hero-video-toggle"]').attributes('aria-label')).toMatch(/video di sfondo/)
  })

  it('links the hero button to the open positions and counts them', async () => {
    const wrapper = await mountSite(fixture, { careers: careers([job, { ...job, slug: 'b' }]) })
    expect(wrapper.find('[data-testid="site-hero-cta"]').attributes('href')).toBe('#posizioni')
    expect(wrapper.find('#posizioni').exists()).toBe(true)
    expect(wrapper.find('[data-testid="site-hero-count"]').text()).toContain('2')
  })

  it('loads nothing from YouTube until the visitor clicks, then the nocookie player', async () => {
    const wrapper = await mountSite(fixture)
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('youtube-nocookie')
    await wrapper.find('[data-testid="site-video-facade"]').trigger('click')
    const frame = wrapper.find('[data-testid="site-video-frame"]')
    expect(frame.attributes('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
    expect(frame.attributes('title')).toBe('Il nostro lavoro in due minuti')
  })

  it('keeps the facade in the editor preview', async () => {
    const wrapper = await mountSite(fixture, { mode: 'preview' })
    await wrapper.find('[data-testid="site-video-facade"]').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('main').exists()).toBe(false)
  })

  it('gives every gallery image its own description and loads them lazily', async () => {
    const wrapper = await mountSite(fixture)
    const images = wrapper.findAll('[data-testid="site-gallery"] img')
    expect(images.map((node) => node.attributes('alt'))).toEqual(['Riunione del lunedì', 'Pranzo insieme'])
    expect(images.every((node) => node.attributes('loading') === 'lazy')).toBe(true)
  })

  it('opens external links safely and shows the big numbers', async () => {
    const wrapper = await mountSite(fixture)
    const links = wrapper.findAll('[data-testid="site-link"]')
    expect(links.map((link) => link.attributes('rel'))).toEqual(['noopener noreferrer nofollow', 'noopener noreferrer nofollow'])
    expect(links[0]!.text()).toContain('LinkedIn')
    expect(links[1]!.text()).toContain('Il nostro sito')
    expect(wrapper.find('[data-testid="site-numbers"] dd').text()).toBe('42')
  })

  it('never shows the response time of the positions, only salary and stages', async () => {
    const wrapper = await mountSite(fixture)
    const jobs = wrapper.find('[data-testid="site-jobs"]').text()
    expect(jobs).toContain('3 fasi')
    expect(jobs).not.toMatch(/risposta|giorni/i)
  })

  it('draws a quiet frame when a media file is gone', async () => {
    const wrapper = await mountSite(fixture, { media: {} })
    expect(wrapper.findAll('[data-testid="site-image-missing"]').length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="site-hero"]').attributes('data-background')).toBe('video')
  })

  it('gives a page without hero a plain title', async () => {
    const page = defaultCareersPage('Acme')
    const wrapper = await mountSite({ ...page, sections: page.sections.filter((section) => section.type !== 'hero') })
    expect(wrapper.find('h1').text()).toBe('Posizioni aperte in Acme')
  })
})
