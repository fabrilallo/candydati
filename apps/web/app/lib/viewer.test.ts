import { describe, expect, it, vi } from 'vitest'
import type { AuthApi } from './auth-api'
import { loadViewer } from './viewer'

const user = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
const org = { id: 'o1', name: 'Acme', slug: 'acme' }

const fakeApi = (overrides: Partial<AuthApi> = {}): AuthApi =>
  ({
    getSession: vi.fn(async () => ({ user, activeOrganizationId: 'o1' })),
    listOrganizations: vi.fn(async () => [org]),
    setActiveOrganization: vi.fn(async () => undefined),
    getFullOrganization: vi.fn(async () => ({ ...org, members: [{ id: 'm1', userId: 'u1', role: 'admin', name: 'Ada', email: user.email }], invitations: [] })),
    ...overrides,
  }) as unknown as AuthApi

describe('loadViewer', () => {
  it('is null without a session', async () => {
    expect(await loadViewer(fakeApi({ getSession: vi.fn(async () => null) }))).toBeNull()
  })

  it('reads organization and role of the active organization', async () => {
    expect(await loadViewer(fakeApi())).toEqual({ user, organization: org, role: 'admin' })
  })

  it('activates the first organization when none is active', async () => {
    const setActive = vi.fn(async () => undefined)
    const viewer = await loadViewer(fakeApi({ getSession: vi.fn(async () => ({ user, activeOrganizationId: null })), setActiveOrganization: setActive }))
    expect(setActive).toHaveBeenCalledWith('o1')
    expect(viewer?.organization).toEqual(org)
  })

  it('has no organization for a brand new user', async () => {
    const viewer = await loadViewer(fakeApi({ getSession: vi.fn(async () => ({ user, activeOrganizationId: null })), listOrganizations: vi.fn(async () => []) }))
    expect(viewer).toEqual({ user, organization: null, role: null })
  })

  it('has no role when the member row is missing', async () => {
    const viewer = await loadViewer(fakeApi({ getFullOrganization: vi.fn(async () => ({ ...org, members: [], invitations: [] })) }))
    expect(viewer?.role).toBeNull()
  })

  it('treats a missing full organization as no organization', async () => {
    const viewer = await loadViewer(fakeApi({ getFullOrganization: vi.fn(async () => null) }))
    expect(viewer).toEqual({ user, organization: null, role: null })
  })
})
