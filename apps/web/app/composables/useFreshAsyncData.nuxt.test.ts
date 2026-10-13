import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

describe('useFreshAsyncData', () => {
  it('refetches an entry left by an earlier visit when the screen is opened again', async () => {
    let calls = 0
    let seen: number | null = null
    const Screen = defineComponent({
      setup() {
        const { data } = useFreshAsyncData('fresh-test-entry', async () => ++calls)
        return () => {
          seen = data.value ?? null
          return h('div')
        }
      },
    })
    const first = await mountSuspended(Screen)
    await flushPromises()
    expect(calls).toBe(1)
    // Another component keeps the entry alive (as the job tabs do), then the board opens on top of it.
    const second = await mountSuspended(Screen)
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(seen).toBe(calls)
    first.unmount()
    second.unmount()
  })
})
