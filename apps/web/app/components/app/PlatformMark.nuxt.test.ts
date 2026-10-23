import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import PlatformMark from './PlatformMark.vue'

describe('PlatformMark', () => {
  it('shows the same mark as the tab icon, decorative next to the product name', async () => {
    const wrapper = await mountSuspended(PlatformMark)
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('/favicon.svg')
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('aria-hidden')).toBe('true')
  })
})
