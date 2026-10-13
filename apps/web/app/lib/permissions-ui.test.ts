import { describe, expect, it } from 'vitest'
import { activeNavId, assignableRoles, can, defaultInviteRole, navSections, parseMemberRole, visibleNav } from './permissions-ui'

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
    expect(visibleNav('recruiter').map((item) => item.id)).toEqual(['dashboard', 'jobs', 'candidates', 'templates', 'members'])
    expect(visibleNav('owner').map((item) => item.id)).toEqual(['dashboard', 'jobs', 'candidates', 'templates', 'members', 'privacy', 'audit'])
  })

  it('shows candidates to every role that reads them and the privacy settings only with privacy:manage', () => {
    expect(visibleNav('interviewer').map((item) => item.id)).toContain('candidates')
    expect(visibleNav('admin').map((item) => item.id)).toContain('privacy')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('privacy')
  })

  it('shows the jobs entry to anyone with job:read and to nobody without a role', () => {
    expect(visibleNav('interviewer').map((item) => item.id)).toContain('jobs')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('jobs')
  })
})

describe('navSections', () => {
  it('groups the visible items and drops nothing the role may see', () => {
    expect(navSections('owner').map((section) => [section.id, section.items.map((item) => item.id)])).toEqual([
      ['work', ['dashboard', 'jobs', 'candidates', 'templates']],
      ['organization', ['members', 'privacy', 'audit']],
    ])
    expect(navSections(null).map((section) => section.id)).toEqual(['work', 'organization'])
  })
})

describe('activeNavId', () => {
  const items = visibleNav('owner')
  it('picks the most specific entry', () => {
    expect(activeNavId('/app', items)).toBe('dashboard')
    expect(activeNavId('/app/jobs', items)).toBe('jobs')
    expect(activeNavId('/app/jobs/abc', items)).toBe('jobs')
    expect(activeNavId('/app/jobs/templates', items)).toBe('templates')
    expect(activeNavId('/app/settings/audit-log', items)).toBe('audit')
    expect(activeNavId('/app/candidates/c1', items)).toBe('candidates')
    expect(activeNavId('/app/settings/privacy', items)).toBe('privacy')
    expect(activeNavId('/elsewhere', items)).toBeNull()
  })
})
