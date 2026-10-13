import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeContent, NOW, ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import TemplatesPanel from './TemplatesPanel.vue'

const state = vi.hoisted(() => ({ templates: [] as { id: string; name: string }[], deleted: [] as string[] }))
const template = (id: string, name: string) => ({ id, name, content: completeContent, updatedAt: NOW })
registerEndpoint('/api/v1/job-templates', () => ok(state.templates.map((t) => template(t.id, t.name))))
registerEndpoint('/api/v1/job-templates/t1', { method: 'DELETE', handler: () => (state.deleted.push('t1'), state.templates.splice(0, 1), ok({ id: 't1' })) })

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(TemplatesPanel)
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="template-row"], [data-testid="templates-empty"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  state.templates.splice(0, state.templates.length, { id: 't1', name: 'Backend senior' })
  state.deleted.length = 0
  useViewer().viewer.value = viewerWith('owner')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('TemplatesPanel', () => {
  it('lists templates with a link to create an ad from each', async () => {
    const wrapper = await mountPanel()
    const row = wrapper.find('[data-testid="template-row"]')
    expect(row.text()).toContain('Backend senior')
    expect(row.text()).toContain('Backend developer')
    expect(row.find('a').attributes('href')).toBe('/app/jobs/new?template=t1')
    expect(row.find('a').attributes('aria-label')).toBe('Crea un annuncio dal template Backend senior')
    expect(row.find('a').text()).toBe('Usa template')
  })

  it('says what each template pre-fills', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="template-summary"]').text()).toBe('RAL, processo in 2 fasi, 2 requisiti, 3 attività, 1 benefit')
  })

  it('deletes only after confirmation', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="delete-template"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Eliminare il template?')
    expect(state.deleted).toEqual([])
    document.body.querySelector<HTMLElement>('[data-testid="confirm"]')?.click()
    await vi.waitFor(() => expect(state.deleted).toEqual(['t1']))
    await vi.waitFor(() => expect(wrapper.find('[data-testid="templates-empty"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="templates-empty"]').text()).toContain('Salva come template')
  })

  it('does not offer deletion without job_template:delete', async () => {
    useViewer().viewer.value = viewerWith('hiring_manager')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="delete-template"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-row"] a').exists()).toBe(true)
  })

  it('does not offer creating an ad without job:create', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="template-row"] a').exists()).toBe(false)
  })
})
