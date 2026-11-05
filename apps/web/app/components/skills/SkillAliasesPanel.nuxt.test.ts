import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import SkillAliasesPanel from './SkillAliasesPanel.vue'

const state = vi.hoisted(() => ({ added: [] as unknown[], toggles: [] as string[], removed: 0, conflict: false }))
const overview = () => ({
  builtIn: [
    { id: 'go', name: 'Go', aliases: [{ alias: 'golang', enabled: true }] },
    { id: 'kubernetes', name: 'Kubernetes', aliases: [{ alias: 'k8s', enabled: false }] },
  ],
  own: [{ id: 'a1', skill: 'Go', alias: 'Gopher', createdAt: '2026-11-01T10:00:00.000Z' }],
  limit: 500,
})
registerEndpoint('/api/v1/skill-aliases', async (event) => {
  if (event.method !== 'POST') return ok(overview())
  if (state.conflict) {
    setResponseStatus(event, 409)
    return { success: false, data: null, error: { code: 'conflict', message: 'alias_taken' } }
  }
  const body = await readBody<{ skill: string; alias: string }>(event)
  state.added.push(body)
  return ok({ id: 'a2', skill: 'Go', alias: body.alias, createdAt: '2026-11-02T10:00:00.000Z' })
})
registerEndpoint('/api/v1/skill-aliases/a1', { method: 'DELETE', handler: () => (state.removed += 1, ok({ deleted: true })) })
registerEndpoint('/api/v1/skill-aliases/built-in/disable', { method: 'POST', handler: async (event) => (state.toggles.push(`off:${(await readBody<{ alias: string }>(event)).alias}`), ok({})) })
registerEndpoint('/api/v1/skill-aliases/built-in/enable', { method: 'POST', handler: async (event) => (state.toggles.push(`on:${(await readBody<{ alias: string }>(event)).alias}`), ok({})) })

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(SkillAliasesPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.findAll('[data-testid="alias-item"]').length).toBe(1))
  return wrapper
}
beforeEach(() => {
  state.added.length = 0
  state.toggles.length = 0
  state.removed = 0
  state.conflict = false
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

const type = async (wrapper: Awaited<ReturnType<typeof mountPanel>>, testId: string, value: string) => {
  const input = wrapper.find<HTMLInputElement>(`[data-testid="${testId}"]`)
  await input.setValue(value)
}

describe('skill aliases', () => {
  it('lists the organization aliases and the built-in ones, each with its switch', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="alias-item"]').text()).toContain('Gopher')
    expect(wrapper.find('[data-testid="alias-item"]').text()).toContain('Go')
    const toggles = wrapper.findAll('[data-testid="built-in-toggle"]')
    expect(toggles.map((toggle) => [toggle.attributes('data-alias'), toggle.attributes('aria-checked')])).toEqual([
      ['golang', 'true'],
      ['k8s', 'false'],
    ])
    expect(wrapper.find('[data-testid="built-in-off"]').text()).toContain('1')
  })

  it('adds an alias, and asks for both fields first', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="alias-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="own-aliases"]').text()).toContain('Scrivi una competenza')
    expect(state.added).toEqual([])
    await type(wrapper, 'alias-skill', 'Go')
    await type(wrapper, 'alias-alias', ' Go developer ')
    await wrapper.find('[data-testid="alias-form"]').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="alias-item"]').length).toBe(2))
    expect(state.added).toEqual([{ skill: 'Go', alias: 'Go developer' }])
  })

  it('tells why the api refused an alias', async () => {
    state.conflict = true
    const wrapper = await mountPanel()
    await type(wrapper, 'alias-skill', 'Python')
    await type(wrapper, 'alias-alias', 'golang')
    await wrapper.find('[data-testid="alias-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="own-aliases"]').text()).toContain('appartiene già a un\'altra competenza'))
    expect(wrapper.findAll('[data-testid="alias-item"]').length).toBe(1)
  })

  it('removes an alias of the organization', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="alias-remove"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="aliases-empty"]').exists()).toBe(true))
    expect(state.removed).toBe(1)
  })

  it('switches a built-in alias off and on, and narrows the list when searching', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-alias="golang"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-alias="golang"]').attributes('aria-checked')).toBe('false'))
    await wrapper.find('[data-alias="k8s"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-alias="k8s"]').attributes('aria-checked')).toBe('true'))
    expect(state.toggles).toEqual(['off:golang', 'on:k8s'])
    await type(wrapper, 'built-in-search', 'kube')
    expect(wrapper.findAll('[data-testid="built-in-item"]').length).toBe(1)
    await type(wrapper, 'built-in-search', 'zzz')
    expect(wrapper.find('[data-testid="built-in-empty"]').exists()).toBe(true)
  })
})
