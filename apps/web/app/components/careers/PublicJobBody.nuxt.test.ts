import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { PublicJobPageDto, PublishedJobContent } from '@tt/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { completeContent } from '~~/test/fixtures/job-fixtures'
import CareersList from './CareersList.vue'
import PublicJobBody from './PublicJobBody.vue'

const page = (overrides: Partial<PublishedJobContent> = {}, logo: string | null = null): PublicJobPageDto => ({
  organization: { name: 'Acme', slug: 'acme', logo },
  job: { slug: 'backend-1', content: { ...(completeContent as PublishedJobContent), ...overrides }, publishedAt: '2026-10-13T10:00:00.000Z' },
})

describe('PublicJobBody', () => {
  beforeAll(async () => {
    await useNuxtApp().$i18n.loadLocaleMessages('en')
  })

  it('shows the salary range, contract, work mode and place', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const facts = Object.fromEntries(wrapper.findAll('[data-fact]').map((node) => [node.attributes('data-fact'), node.text()]))
    expect(facts.salary).toContain('45.000')
    expect(facts.salary).toContain('60.000')
    expect(facts.salary).toContain('lordi all\'anno (RAL)')
    expect(facts.contract).toContain('Tempo indeterminato')
    expect(facts.workMode).toContain('Ibrido')
    expect(facts.location).toContain('Milano, Italia')
    expect(facts.location).toContain('2 giorni a settimana in sede')
  })

  it('lists the selection process in order with duration and who conducts it, plus the response time', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const stages = wrapper.findAll('[data-testid="job-stage"]').map((node) => node.text())
    expect(stages).toHaveLength(2)
    expect(stages[0]).toContain('1. Chiamata conoscitiva')
    expect(stages[0]).toContain('30 min, a cura di: Recruiter')
    expect(stages[1]).toContain('2. Colloquio tecnico')
    expect(stages[1]).toContain('1 h 30 min, a cura di: Responsabile tecnico')
    expect(stages[1]).toContain('Pair su un problema reale')
    expect(wrapper.find('[data-testid="job-process"] ol').exists()).toBe(true)
    expect(wrapper.find('[data-testid="job-response-time"]').text()).toContain('entro 5 giorni')
  })

  it('splits requirements into two lists and shows every section that has content', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    const sections = wrapper.findAll('[data-section]').map((node) => node.attributes('data-section'))
    expect(sections).toEqual(['responsibilities', 'mustHave', 'niceToHave', 'technologies', 'benefits', 'growth', 'culture'])
    expect(wrapper.find('[data-section="mustHave"]').text()).toContain('TypeScript')
    expect(wrapper.find('[data-section="niceToHave"]').text()).toContain('Postgres')
    expect(wrapper.find('[data-section="workLifeBalance"]').exists()).toBe(false)
  })

  it('reads in the language of the ad, not of the visitor', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page({ language: 'en' }) } })
    expect(wrapper.attributes('lang')).toBe('en')
    expect(wrapper.text()).toContain('Selection process')
    expect(wrapper.text()).toContain('What you will do')
    expect(wrapper.text()).toContain('You will hear back within 5 days after each stage.')
    expect(wrapper.text()).not.toContain('Processo di selezione')
  })

  it('has no apply action in this phase', async () => {
    const wrapper = await mountSuspended(PublicJobBody, { props: { page: page() } })
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('CareersList', () => {
  const summary = {
    slug: 'backend-1',
    title: 'Backend developer',
    role: 'backend_developer' as const,
    seniority: 'senior' as const,
    contractType: 'permanent' as const,
    workMode: 'remote' as const,
    location: { country: 'IT' },
    salary: { min: 40000, max: 50000, currency: 'EUR' as const, period: 'year' as const },
    publishedAt: '2026-10-13T10:00:00.000Z',
  }

  it('lists the ads with a stable path link and the salary always visible', async () => {
    const wrapper = await mountSuspended(CareersList, { props: { careers: { organization: { name: 'Acme', slug: 'acme', logo: 'https://cdn.test/l.png' }, jobs: [summary] } } })
    expect(wrapper.find('h1').text()).toBe('Posizioni aperte in Acme')
    expect(wrapper.find('img').attributes('alt')).toBe('Logo di Acme')
    const card = wrapper.find('[data-testid="careers-job"]')
    expect(card.find('a').attributes('href')).toBe('/careers/acme/backend-1')
    expect(card.text()).toContain('Senior')
    expect(card.text()).toContain('Tempo indeterminato')
    expect(card.text()).toContain('Da remoto · Italia')
    expect(card.find('[data-testid="careers-salary"]').text()).toContain('40.000')
  })

  it('shows an empty state', async () => {
    const wrapper = await mountSuspended(CareersList, { props: { careers: { organization: { name: 'Acme', slug: 'acme', logo: null }, jobs: [] } } })
    expect(wrapper.find('[data-testid="careers-empty"]').text()).toContain('Al momento non ci sono posizioni aperte')
    expect(wrapper.find('[data-testid="careers-job"]').exists()).toBe(false)
  })
})
