import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '~~/test/fixtures/job-fixtures'
import VideoRoomPanel from './VideoRoomPanel.vue'

const ROOM = 'https://meet.google.com/abc-defg-hij'
const state = vi.hoisted(() => ({ room: { url: null, provider: null } as { url: string | null; provider: string | null }, calls: [] as { method: string; body: unknown }[], refuse: false }))
registerEndpoint('/api/v1/me/video-room', async (event) => {
  const method = event.method
  const body = method === 'PUT' ? await readBody(event) : null
  state.calls.push({ method, body })
  if (method === 'PUT' && state.refuse) {
    setResponseStatus(event, 422)
    return { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'url', message: 'credentials_in_url' }] } }
  }
  if (method === 'PUT') state.room = { url: (body as { url: string }).url, provider: 'meet' }
  if (method === 'DELETE') state.room = { url: null, provider: null }
  return ok(method === 'DELETE' ? { removed: true } : state.room)
})

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(VideoRoomPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="video-room-form"]').exists()).toBe(true))
  return wrapper
}
beforeEach(() => {
  state.room = { url: null, provider: null }
  state.calls = []
  state.refuse = false
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('my video room', () => {
  it('saves a Meet link and says which service it is', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="video-room-remove"]').exists()).toBe(false)
    await wrapper.find('[data-testid="video-room-url"]').setValue(`  ${ROOM} `)
    await wrapper.find('[data-testid="video-room-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="video-room-saved"]').exists()).toBe(true))
    expect(state.calls.filter((call) => call.method === 'PUT')).toEqual([{ method: 'PUT', body: { url: ROOM } }])
    expect(wrapper.find('[data-testid="video-room-saved"]').text()).toContain('Google Meet')
  })

  it('shows the saved room and removes it', async () => {
    state.room = { url: ROOM, provider: 'meet' }
    const wrapper = await mountPanel()
    expect((wrapper.find('[data-testid="video-room-url"]').element as HTMLInputElement).value).toBe(ROOM)
    await wrapper.find('[data-testid="video-room-remove"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="video-room-remove"]').exists()).toBe(false))
    expect(state.calls.map((call) => call.method)).toContain('DELETE')
  })

  it('refuses a link that is not a plain https address, before asking the api', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="video-room-url"]').setValue('http://meet.google.com/abc')
    await wrapper.find('[data-testid="video-room-form"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Serve un link https completo'))
    expect(state.calls.filter((call) => call.method === 'PUT')).toEqual([])
  })
})
