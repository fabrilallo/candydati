import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { useLinkedinBridge, type LinkedinBridge } from '@/composables/useLinkedinBridge'

const state = vi.hoisted(() => ({ status: { enabled: true, maxProfilesPerRun: 3, accepted: false, textVersion: 1 }, accepted: [] as unknown[], sealed: [] as unknown[] }))
registerEndpoint('/api/v1/sourcing/linkedin/status', () => ok(state.status))
registerEndpoint('/api/v1/sourcing/linkedin/accept', async (event) => (state.accepted.push(await readBody(event)), ok({ accepted: true })))
registerEndpoint('/api/v1/sourcing/linkedin/results', async (event) => (state.sealed.push(await readBody(event)), ok({ order: 'not a ranking', people: [{ ref: 'r', firstName: 'Maja' }] })))

const profile = { profileUrl: 'https://www.linkedin.com/in/maja', fullName: 'Maja Lind', headline: null, location: null, text: '' }
const requests: unknown[] = []
const fakeChrome = (answer: unknown) => ({ runtime: { sendMessage: (_id: string, message: unknown, callback: (response: unknown) => void) => (requests.push(message), callback(answer)) } })

let bridge: LinkedinBridge
const mounted: { unmount: () => void }[] = []
const mountBridge = async () => {
  const wrapper = await mountSuspended(defineComponent({ setup: () => ((bridge = useLinkedinBridge()), () => h('div')) }))
  mounted.push(wrapper)
}
beforeEach(() => {
  state.status = { enabled: true, maxProfilesPerRun: 3, accepted: false, textVersion: 1 }
  state.accepted = []
  state.sealed = []
  requests.length = 0
  useRuntimeConfig().public.extensionId = 'ext-id'
  useViewer().viewer.value = viewerWith('recruiter')
  ;(globalThis as { chrome?: unknown }).chrome = fakeChrome({ ok: true, profiles: [profile] })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  delete (globalThis as { chrome?: unknown }).chrome
})

const input = { jobId: 'j1', keywords: ['Go'], location: null, limit: 50 }

describe('LinkedIn bridge', () => {
  it('asks the person to accept the risk once, caps the search, and returns what the api sealed', async () => {
    await mountBridge()
    const running = bridge.run(input)
    await vi.waitFor(() => expect(bridge.pendingConsent.value).not.toBeNull())
    bridge.answerConsent(true)
    expect(await running).toEqual({ order: 'not a ranking', people: [{ ref: 'r', firstName: 'Maja' }] })
    expect(state.accepted).toEqual([{ textVersion: 1 }])
    expect(requests).toEqual([{ type: 'candydati.search_linkedin', keywords: ['Go'], location: null, limit: 3 }])
    expect(state.sealed).toEqual([{ jobId: 'j1', keywords: ['Go'], location: null, profiles: [profile] }])
  })

  it('stops with a code the assistant explains: off, declined, extension missing, captcha', async () => {
    await mountBridge()
    state.status = { ...state.status, enabled: false }
    expect(await bridge.run(input)).toEqual({ error: { code: 'linkedin_off' } })
    state.status = { ...state.status, enabled: true }
    const declined = bridge.run(input)
    await vi.waitFor(() => expect(bridge.pendingConsent.value).not.toBeNull())
    bridge.answerConsent(false)
    expect(await declined).toEqual({ error: { code: 'not_accepted' } })
    state.status = { ...state.status, accepted: true }
    ;(globalThis as { chrome?: unknown }).chrome = fakeChrome({ ok: false, error: 'captcha' })
    expect(await bridge.run(input)).toEqual({ error: { code: 'captcha' } })
    delete (globalThis as { chrome?: unknown }).chrome
    expect(await bridge.run(input)).toMatchObject({ error: { code: 'extension_missing' } })
    expect(state.sealed).toEqual([])
  })
})
