import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { PublicJobPage, PublishedJobContent } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { completeContent } from '~~/test/fixtures/job-fixtures'
import CareersList from './CareersList.vue'
import PublicJobBody from './PublicJobBody.vue'

type JobClient = NonNullable<PublicJobPage['job']['client']>
const page = (client?: JobClient): PublicJobPage => ({
  organization: { name: 'Talenti Srl', slug: 'talenti', logo: null },
  job: {
    slug: 'backend-1',
    content: completeContent as PublishedJobContent,
    publishedAt: '2026-10-13T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
    ...(client ? { client } : {}),
  },
  privacyNotice: null,
})

describe('the client of an agency ad', () => {
  it('names the client with its website next to the agency, and the authorization', async () => {
    const wrapper = await mountSuspended(PublicJobBody, {
      props: { page: page({ display: 'named', name: 'Acme Spa', website: 'https://acme.it', logo: null, agencyAuthorization: 'Aut. Min. 123/2020' }) },
    })
    const block = wrapper.find('[data-testid="public-job-client"]')
    expect(block.attributes('data-display')).toBe('named')
    expect(block.text()).toContain('per Acme Spa')
    expect(block.text()).toContain('Pubblicato da Talenti Srl, agenzia di selezione')
    expect(block.find('[data-testid="public-job-client-website"]').attributes('href')).toBe('https://acme.it')
    expect(block.find('[data-testid="public-job-client-authorization"]').text()).toBe('Autorizzazione: Aut. Min. 123/2020')
  })

  it('says a confidential client is confidential, never another name, and drops an unsafe website', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ display: 'confidential', name: null, website: null, logo: null, agencyAuthorization: null }) } })
    const block = wrapper.find('[data-testid="public-job-client"]')
    expect(block.text()).toContain('Cliente riservato - selezione curata da Talenti Srl')
    expect(block.find('[data-testid="public-job-client-authorization"]').exists()).toBe(false)
    const unsafe = await mountSuspended(PublicJobBody, { props: { page: page({ display: 'named', name: 'Acme', website: 'javascript:alert(1)', logo: null, agencyAuthorization: null }) } })
    expect(unsafe.find('[data-testid="public-job-client-website"]').exists()).toBe(false)
  })

  it('shows nothing about clients on an ordinary ad', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(wrapper.find('[data-testid="public-job-client"]').exists()).toBe(false)
  })

  it('tells who each listed ad is for', async () => {
    const summary = {
      slug: 'backend-1',
      title: 'Backend developer',
      role: 'backend_developer' as const,
      seniority: 'senior' as const,
      contractType: 'permanent' as const,
      workMode: 'remote' as const,
      location: { country: 'IT' },
      salary: { min: 40000, max: 50000, currency: 'EUR' as const, period: 'year' as const },
      stageCount: 2,
      responseDays: 5,
      publishedAt: '2026-10-13T10:00:00.000Z',
      updatedAt: '2026-10-13T10:00:00.000Z',
    }
    const jobs = [
      { ...summary, client: { display: 'named' as const, name: 'Acme Spa' } },
      { ...summary, slug: 'backend-2', client: { display: 'confidential' as const, name: null } },
      { ...summary, slug: 'backend-3' },
    ]
    const wrapper = await mountSuspended(CareersList, { props: { careers: { organization: { name: 'Talenti', slug: 'talenti', logo: null }, jobs } } })
    expect(wrapper.findAll('[data-testid="careers-job-client"]').map((node) => node.text())).toEqual(['per Acme Spa', 'Cliente riservato'])
  })
})
