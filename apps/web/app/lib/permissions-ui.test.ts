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

  it('knows the phase 5 rights: export and erase for recruiters, the organization export for owner and admin', () => {
    expect(can('recruiter', 'candidate:erase')).toBe(true)
    expect(can('recruiter', 'candidate:export')).toBe(true)
    expect(can('hiring_manager', 'candidate:erase')).toBe(false)
    expect(can('recruiter', 'data:export')).toBe(false)
    expect(can('admin', 'data:export')).toBe(true)
    expect(can(null, 'data:export')).toBe(false)
  })
})

describe('reports (phase 10)', () => {
  it('lets owner, admin, recruiter and hiring manager read the reports, not interviewers', () => {
    expect((['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const).map((role) => can(role, 'report:read'))).toEqual([true, true, true, true, false])
    expect(can(null, 'report:read')).toBe(false)
  })

  it('lists the reports under Selezione, right after the candidates', () => {
    const work = navSections('hiring_manager').find((section) => section.id === 'work')?.items.map((item) => item.id) ?? []
    expect(work.indexOf('reports')).toBe(work.indexOf('candidates') + 1)
    expect(visibleNav('interviewer').map((item) => item.id)).not.toContain('reports')
    expect(activeNavId('/app/reports', visibleNav('owner'))).toBe('reports')
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
    expect(visibleNav('recruiter').map((item) => item.id)).toEqual(['dashboard', 'attention', 'tasks', 'jobs', 'jobRequests', 'candidates', 'reports', 'imports', 'templates', 'members', 'security', 'emailTemplates', 'distribution'])
    expect(visibleNav('owner').map((item) => item.id)).toEqual(['dashboard', 'attention', 'tasks', 'jobs', 'jobRequests', 'candidates', 'reports', 'imports', 'templates', 'members', 'security', 'privacy', 'email', 'ai', 'emailTemplates', 'webhooks', 'distribution', 'careersPage', 'api', 'data', 'migrations', 'audit'])
  })

  it('shows webhooks only with webhook:manage and the work queues to everyone who reads candidates', () => {
    expect(visibleNav('admin').map((item) => item.id)).toContain('webhooks')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('webhooks')
    expect(visibleNav('admin').map((item) => item.id)).toContain('api')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('api')
    expect(visibleNav('interviewer').map((item) => item.id)).toEqual(expect.arrayContaining(['attention', 'tasks']))
  })

  it('shows the import only to whoever can manage imports', () => {
    expect(visibleNav('recruiter').map((item) => item.id)).toContain('imports')
    expect(visibleNav('hiring_manager').map((item) => item.id)).not.toContain('imports')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('imports')
  })

  it('shows candidates to every role that reads them and the privacy settings only with privacy:manage', () => {
    expect(visibleNav('interviewer').map((item) => item.id)).toContain('candidates')
    expect(visibleNav('admin').map((item) => item.id)).toContain('privacy')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('privacy')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('email')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('ai')
    expect(visibleNav('interviewer').map((item) => item.id)).not.toContain('emailTemplates')
  })

  it('shows the migration only to owners and admins', () => {
    expect(visibleNav('owner').map((item) => item.id)).toContain('migrations')
    expect(visibleNav('admin').map((item) => item.id)).toContain('migrations')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('migrations')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('migrations')
  })

  it('shows the careers page builder only to owners and admins', () => {
    expect(visibleNav('admin').map((item) => item.id)).toContain('careersPage')
    expect(visibleNav('recruiter').map((item) => item.id)).not.toContain('careersPage')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('careersPage')
  })

  it('shows the jobs entry to anyone with job:read and to nobody without a role', () => {
    expect(visibleNav('interviewer').map((item) => item.id)).toContain('jobs')
    expect(visibleNav(null).map((item) => item.id)).not.toContain('jobs')
  })
})

describe('navSections', () => {
  it('groups the visible items and drops nothing the role may see', () => {
    expect(navSections('owner').map((section) => [section.id, section.items.map((item) => item.id)])).toEqual([
      ['work', ['dashboard', 'attention', 'tasks', 'jobs', 'jobRequests', 'candidates', 'reports', 'imports', 'templates']],
      ['organization', ['members', 'security', 'privacy', 'email', 'ai', 'emailTemplates', 'webhooks', 'distribution', 'careersPage', 'api', 'data', 'migrations', 'audit']],
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
    expect(activeNavId('/app/settings/email', items)).toBe('email')
    expect(activeNavId('/app/settings/ai', items)).toBe('ai')
    expect(activeNavId('/app/settings/email-templates', items)).toBe('emailTemplates')
    expect(activeNavId('/app/settings/careers', items)).toBe('careersPage')
    expect(activeNavId('/elsewhere', items)).toBeNull()
  })
})
