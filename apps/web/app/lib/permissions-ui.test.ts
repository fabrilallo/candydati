import { describe, expect, it } from 'vitest'
import { assignableRoles, can, defaultInviteRole, parseMemberRole, visibleNav } from './permissions-ui'

describe('parseMemberRole', () => {
  it('reads a single role', () => {
    expect(parseMemberRole('admin')).toBe('admin')
  })

  it('takes the most powerful of a comma list', () => {
    expect(parseMemberRole('recruiter,admin')).toBe('admin')
  })

  it('ignores unknown values', () => {
    expect(parseMemberRole('wizard')).toBeNull()
    expect(parseMemberRole(undefined)).toBeNull()
    expect(parseMemberRole(42)).toBeNull()
  })
})

describe('can', () => {
  it('follows the domain grants and denies without a role', () => {
    expect(can('admin', 'audit:read')).toBe(true)
    expect(can('recruiter', 'audit:read')).toBe(false)
    expect(can(null, 'audit:read')).toBe(false)
  })
})

describe('assignableRoles', () => {
  it('lets an owner assign every role', () => {
    expect(assignableRoles('owner')).toEqual(['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'])
  })

  it('keeps owner out for admins', () => {
    expect(assignableRoles('admin')).not.toContain('owner')
    expect(assignableRoles('admin')).toContain('recruiter')
  })

  it('is empty without member management', () => {
    expect(assignableRoles('interviewer')).toEqual([])
    expect(assignableRoles(null)).toEqual([])
  })
})

describe('defaultInviteRole', () => {
  it('proposes the domain default when assignable', () => {
    expect(defaultInviteRole('admin')).toBe('recruiter')
  })

  it('is null when nothing can be assigned', () => {
    expect(defaultInviteRole('recruiter')).toBeNull()
  })
})

describe('visibleNav', () => {
  it('hides the audit log without audit:read', () => {
    expect(visibleNav('recruiter').map((item) => item.id)).toEqual(['dashboard', 'jobs', 'members'])
    expect(visibleNav('owner').map((item) => item.id)).toEqual(['dashboard', 'jobs', 'members', 'audit'])
  })

  it('shows the jobs entry to anyone with job:read and to nobody without a role', () => {
    expect(visibleNav('interviewer').map((item) => item.id)).toContain('jobs')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('jobs')
  })
})
