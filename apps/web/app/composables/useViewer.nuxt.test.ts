import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const user = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
const org = { id: 'o1', name: 'Acme', slug: 'acme' }
const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  listOrganizations: vi.fn(),
  setActiveOrganization: vi.fn(),
  getFullOrganization: vi.fn(),
}))
mockNuxtImport('useAuthApi', () => () => api)

describe('useViewer', () => {
  beforeEach(() => {
    useViewer().viewer.value = undefined
    vi.clearAllMocks()
    api.getSession.mockResolvedValue({ user, activeOrganizationId: 'o1' })
    api.getFullOrganization.mockResolvedValue({ ...org, members: [{ id: 'm1', userId: 'u1', role: 'owner', name: 'Ada', email: user.email }], invitations: [] })
  })

  it('loads once and then serves the cached viewer', async () => {
    const { ensure } = useViewer()
    const first = await ensure()
    const second = await ensure()
    expect(first).toEqual({ user, organization: org, role: 'owner' })
    expect(second).toEqual(first)
    expect(api.getSession).toHaveBeenCalledTimes(1)
  })

  it('refreshes on demand and clears on sign out', async () => {
    const { ensure, refresh, clear, viewer } = useViewer()
    await ensure()
    api.getSession.mockResolvedValue(null)
    expect(await refresh()).toBeNull()
    expect(api.getSession).toHaveBeenCalledTimes(2)
    api.getSession.mockResolvedValue({ user, activeOrganizationId: 'o1' })
    await refresh()
    clear()
    expect(viewer.value).toBeNull()
  })
})
