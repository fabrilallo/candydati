import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

const mountProbe = async (dirty: Ref<boolean>) => {
  const Probe = defineComponent({
    setup() {
      useUnsavedGuard(dirty)
      return () => h('div')
    },
  })
  return mountSuspended(Probe)
}

const leave = (): BeforeUnloadEvent => {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(event)
  return event
}

describe('useUnsavedGuard', () => {
  it('asks the browser to confirm closing the tab only with unsaved changes', async () => {
    const dirty = ref(false)
    const wrapper = await mountProbe(dirty)
    expect(leave().defaultPrevented).toBe(false)
    dirty.value = true
    expect(leave().defaultPrevented).toBe(true)
    dirty.value = false
    expect(leave().defaultPrevented).toBe(false)
    wrapper.unmount()
    dirty.value = true
    expect(leave().defaultPrevented).toBe(false)
  })
})
