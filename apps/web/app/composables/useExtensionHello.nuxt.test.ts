import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useExtensionHello } from './useExtensionHello'

const messages: unknown[] = []
const mounted: { unmount: () => void }[] = []
const mountHello = async () => {
  mounted.push(await mountSuspended(defineComponent({ setup: () => (useExtensionHello(), () => h('div')) })))
}
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  messages.length = 0
  delete (globalThis as { chrome?: unknown }).chrome
})

describe('hello to the extension', () => {
  it('tells the extension where this app is when it is configured, and stays silent otherwise', async () => {
    ;(globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: (_id: string, message: unknown, callback: (response: unknown) => void) => (messages.push(message), callback({ ok: true })) } }
    useRuntimeConfig().public.extensionId = ''
    await mountHello()
    expect(messages).toEqual([])
    useRuntimeConfig().public.extensionId = 'ext-id'
    await mountHello()
    await vi.waitFor(() => expect(messages).toEqual([{ type: 'candydati.hello' }]))
  })
})
