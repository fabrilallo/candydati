import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { PublicCareersDto, PublicJobSummaryDto } from '@tt/domain'
import { afterEach, describe, expect, it } from 'vitest'
import CareersList from './CareersList.vue'

const job = (slug: string, role: PublicJobSummaryDto['role'], workMode: PublicJobSummaryDto['workMode'], responseDays: number): PublicJobSummaryDto => ({
  slug,
  title: `Annuncio ${slug}`,
  role,
  seniority: 'senior',
  contractType: 'permanent',
  workMode,
  location: { country: 'IT', city: 'Milano' },
  salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
  stageCount: 3,
  responseDays,
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
})
const careers = (jobs: PublicJobSummaryDto[]): PublicCareersDto => ({ organization: { name: 'Officina Dati', slug: 'officina', logo: null }, jobs })

const mounted: { unmount: () => void }[] = []
const mountList = async (jobs: PublicJobSummaryDto[]) => {
  const wrapper = await mountSuspended(CareersList, { props: { careers: careers(jobs) } })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

const jobs = [job('a', 'backend_developer', 'hybrid', 3), job('b', 'product_designer', 'remote', 7), job('c', 'frontend_developer', 'remote', 5)]

describe('CareersList', () => {
  it('shows transparency facts on every position and links the whole item', async () => {
    const wrapper = await mountList(jobs)
    const first = wrapper.find('[data-testid="careers-job"]')
    expect(first.find('[data-testid="careers-salary"]').text().replace(/\s/g, ' ')).toBe('40.000 € - 50.000 €')
    expect(first.find('[data-testid="careers-process"]').text()).toContain('3 fasi')
    expect(first.find('[data-testid="careers-process"]').text()).toMatch(/risposta in \d+ giorni/)
    expect(first.find('a').attributes('href')).toMatch(/^\/careers\/officina\/annuncio-|^\/careers\/officina\/[a-c]$/)
  })

  it('groups by role family and states the promise as numbers', async () => {
    const wrapper = await mountList(jobs)
    expect(wrapper.findAll('[data-testid="careers-group"]').map((g) => g.find('h2').text())[0]).toContain('Ingegneria software')
    expect(wrapper.find('[data-testid="careers-stats"]').text()).toContain('7')
    expect(wrapper.find('[data-testid="careers-stats"]').text()).toContain('3')
  })

  it('filters by work mode in the component only, never in the URL', async () => {
    const wrapper = await mountList(jobs)
    await wrapper.find('[data-testid="filter-remote"]').trigger('click')
    expect(wrapper.findAll('[data-testid="careers-job"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="filter-remote"]').attributes('aria-pressed')).toBe('true')
    expect(useRoute().fullPath).not.toContain('?')
    await wrapper.find('[data-testid="filter-all"]').trigger('click')
    expect(wrapper.findAll('[data-testid="careers-job"]')).toHaveLength(3)
  })

  it('hides the filter when there is one work mode only, and shows an empty state without ads', async () => {
    const single = await mountList([job('a', 'backend_developer', 'remote', 3)])
    expect(single.find('[data-testid="careers-filter"]').exists()).toBe(false)
    const empty = await mountList([])
    expect(empty.find('[data-testid="careers-empty"]').text()).toContain('Al momento non ci sono posizioni aperte')
    expect(empty.find('[data-testid="careers-stats"]').exists()).toBe(false)
  })
})
