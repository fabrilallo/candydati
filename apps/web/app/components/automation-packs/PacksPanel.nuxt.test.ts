import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import PacksPanel from './PacksPanel.vue'

const { state, navigate } = vi.hoisted(() => ({ state: { posts: [] as unknown[], packs: [] as unknown[] }, navigate: vi.fn() }))
mockNuxtImport('navigateTo', () => navigate)
const pack = (id: string, name: string, ruleCount: number, templateIds: string[] = []) => ({ id, name, description: '', ruleCount, templateIds, createdBy: 'u1', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' })
registerEndpoint('/api/v1/automation-packs', async (event) => {
  if (event.method !== 'POST') return ok(state.packs)
  const body = await readBody<{ name: string }>(event)
  state.posts.push(body)
  return ok(pack('p9', body.name, 0))
})

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  state.posts.length = 0
  state.packs = [pack('p1', 'Selezione tecnica', 3, ['t1'])]
  navigate.mockReset()
  clearNuxtData()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('automation packs', () => {
  it('lists each pack with its rules and templates and links to it', async () => {
    const wrapper = await mountSuspended(PacksPanel, { attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="pack-row"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="pack-link"]').attributes('href')).toBe('/app/automations/p1')
    expect(wrapper.find('[data-testid="pack-meta"]').text()).toBe('3 regole · Usato da 1 template')
  })

  it('says what packs are for when there is none, and creates one then opens it', async () => {
    state.packs = []
    const wrapper = await mountSuspended(PacksPanel, { attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="packs-empty"]').exists()).toBe(true))
    await wrapper.find('[data-testid="pack-add"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="pack-dialog"]')).not.toBeNull())
    document.body.querySelector<HTMLFormElement>('#pack-form')?.requestSubmit()
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="pack-dialog"]')?.textContent).toContain('Dai un nome al pacchetto'))
    const name = document.body.querySelector<HTMLInputElement>('[data-testid="pack-name"]')
    if (!name) throw new Error('no name field')
    name.value = 'Agenzia'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('#pack-form')?.requestSubmit()
    await vi.waitFor(() => expect(state.posts).toEqual([{ name: 'Agenzia', description: '' }]))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/app/automations/p9'))
  })
})
