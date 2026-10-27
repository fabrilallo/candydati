import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import HelpCatalog from './HelpCatalog.vue'

beforeEach(() => {
  useViewer().viewer.value = viewerWith('owner')
})

describe('HelpCatalog', () => {
  it('lists the recipes by area, each with steps and a link to the page', async () => {
    const wrapper = await mountSuspended(HelpCatalog, { route: '/app/help' })
    expect(wrapper.findAll('h2').length).toBeGreaterThan(2)
    const recipe = wrapper.find('[data-testid="help-recipe-tracked-link"]')
    expect(recipe.text()).toContain('Distribuzione')
    expect(wrapper.find('[data-testid="help-go-tracked-link"]').attributes('href')).toBe('/app/jobs')
  })

  it('finds the tracked link from a question and opens it', async () => {
    const wrapper = await mountSuspended(HelpCatalog, { route: '/app/help' })
    await wrapper.find('[data-testid="help-search"]').setValue('dove creo un link tracciato?')
    await flushPromises()
    const first = wrapper.find('details')
    expect(first.attributes('data-testid')).toBe('help-recipe-tracked-link')
    expect(first.attributes('open')).toBeDefined()
  })

  it('reads the query from the address', async () => {
    const wrapper = await mountSuspended(HelpCatalog, { route: '/app/help?q=webhook' })
    expect(wrapper.find('details').attributes('data-testid')).toBe('help-recipe-webhook')
  })

  it('says so when nothing matches', async () => {
    const wrapper = await mountSuspended(HelpCatalog, { route: '/app/help' })
    await wrapper.find('[data-testid="help-search"]').setValue('zzzz qqqq')
    await flushPromises()
    expect(wrapper.find('[data-testid="help-empty"]').exists()).toBe(true)
  })

  it('shows an interviewer only what an interviewer can do', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountSuspended(HelpCatalog, { route: '/app/help' })
    expect(wrapper.find('[data-testid="help-recipe-tracked-link"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="help-recipe-two-factor"]').exists()).toBe(true)
  })
})
