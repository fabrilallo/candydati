import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const event = (id: string) => ({
  id,
  organizationId: 'o1',
  actor: { type: 'user', id: 'u1', onBehalfOfUserId: null, name: 'Ada' },
  action: 'organization.created',
  target: { type: 'organization', id: 'o1' },
  metadata: {},
  occurredAt: '2026-10-13T10:00:00.000Z',
})

const requested = vi.hoisted(() => [] as string[])
registerEndpoint('/api/v1/audit-log', (e) => {
  const page = Number(new URL(e.node.req.url ?? '', 'http://x').searchParams.get('page'))
  requested.push(String(page))
  return { success: true, data: [event(`e${page}`)], error: null, meta: { total: 41, page, limit: 20 } }
})

describe('useAuditLog', () => {
  it('loads the first page and refetches when the page changes (client state, no URL)', async () => {
    let api!: ReturnType<typeof useAuditLog>
    const Probe = defineComponent({
      setup() {
        api = useAuditLog()
        return () => h('div')
      },
    })
    await mountSuspended(Probe)
    await flushPromises()
    expect(api.events.value.map((e) => e.id)).toEqual(['e1'])
    expect(api.meta.value).toEqual({ total: 41, page: 1, limit: 20 })

    api.goTo(2)
    await flushPromises()
    await vi.waitFor(() => expect(api.events.value.map((e) => e.id)).toEqual(['e2']))
    expect(requested).toEqual(['1', '2'])

    api.goTo(-4)
    expect(api.page.value).toBe(1)
    expect(api.errorKey.value).toBeNull()
  })
})
