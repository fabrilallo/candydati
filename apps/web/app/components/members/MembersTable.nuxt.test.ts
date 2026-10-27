import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { MemberRow } from '@/lib/auth-api'
import MembersTable from './MembersTable.vue'

const members: readonly MemberRow[] = [
  { id: 'm1', userId: 'u1', role: 'owner', name: 'Ada', email: 'ada@example.com' },
  { id: 'm2', userId: 'u2', role: 'recruiter', name: 'Bruno', email: 'bruno@example.com' },
  { id: 'm3', userId: 'u3', role: 'admin', name: 'Carla', email: 'carla@example.com' },
]
const mount = (actorRole: string, currentUserId = 'u1', busyId: string | null = null) =>
  mountSuspended(MembersTable, { props: { members, currentUserId, actorRole, busyId } })

describe('MembersTable', () => {
  it('lets an owner change the role of the others, not their own', async () => {
    const wrapper = await mount('owner')
    expect(wrapper.find('[data-testid="member-role-m1"]').exists()).toBe(false)
    const select = wrapper.find('[data-testid="member-role-m2"]')
    expect(select.attributes('aria-label')).toBe('Ruolo di Bruno')
    await select.setValue('hiring_manager')
    expect(wrapper.emitted('changeRole')).toEqual([['m2', 'hiring_manager']])
  })

  it('does not emit when the same role is picked again', async () => {
    const wrapper = await mount('owner')
    await wrapper.find('[data-testid="member-role-m2"]').setValue('recruiter')
    expect(wrapper.emitted('changeRole')).toBeUndefined()
  })

  it('lets an admin change a recruiter but not the owner, and never offers owner', async () => {
    const wrapper = await mount('admin', 'u3')
    expect(wrapper.find('[data-testid="member-role-m1"]').exists()).toBe(false)
    const options = wrapper.findAll('[data-testid="member-role-m2"] option').map((option) => option.attributes('value'))
    expect(options).not.toContain('owner')
  })

  it('shows only the role to who cannot change members', async () => {
    const wrapper = await mount('recruiter', 'u2')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.text()).toContain('Proprietario')
  })

  it('locks the row while its change is saved', async () => {
    const wrapper = await mount('owner', 'u1', 'm2')
    expect(wrapper.find('[data-testid="member-role-m2"]').attributes('disabled')).toBeDefined()
  })
})
