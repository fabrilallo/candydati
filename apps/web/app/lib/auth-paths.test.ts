import { describe, expect, it } from 'vitest'
import { isPublicPath, loginLocation, resolveGuard, safeRedirect } from './auth-paths'

const org = { id: 'o1', name: 'Acme', slug: 'acme' }
const withOrg = { user: { id: 'u', name: 'Ada', email: 'a@b.co' }, organization: org, role: 'owner' as const }
const withoutOrg = { ...withOrg, organization: null, role: null }

describe('safeRedirect', () => {
  it('accepts internal paths only', () => {
    expect(safeRedirect('/accept-invitation/abc')).toBe('/accept-invitation/abc')
    expect(safeRedirect('//evil.example')).toBeNull()
    expect(safeRedirect('https://evil.example')).toBeNull()
    expect(safeRedirect('/\\evil')).toBeNull()
    expect(safeRedirect(['/a'])).toBeNull()
    expect(safeRedirect(undefined)).toBeNull()
  })
})

describe('loginLocation', () => {
  it('carries the destination', () => {
    expect(loginLocation('/accept-invitation/x')).toBe('/login?redirect=%2Faccept-invitation%2Fx')
  })

  it('does not carry the app root', () => {
    expect(loginLocation('/app')).toBe('/login')
  })
})

describe('resolveGuard', () => {
  it('sends anonymous visitors of protected pages to login', () => {
    expect(resolveGuard('/app/settings/members', null)).toBe('/login?redirect=%2Fapp%2Fsettings%2Fmembers')
    expect(resolveGuard('/onboarding', null)).toBe('/login?redirect=%2Fonboarding')
    expect(resolveGuard('/accept-invitation/i1', null)).toBe('/login?redirect=%2Faccept-invitation%2Fi1')
    expect(resolveGuard('/', null)).toBe('/login')
  })

  it('lets anonymous visitors see login and signup', () => {
    expect(resolveGuard('/login', null)).toBeNull()
    expect(resolveGuard('/signup', null)).toBeNull()
  })

  it('sends users without an organization to onboarding', () => {
    expect(resolveGuard('/app', withoutOrg)).toBe('/onboarding')
    expect(resolveGuard('/app/settings/audit-log', withoutOrg)).toBe('/onboarding')
    expect(resolveGuard('/onboarding', withoutOrg)).toBeNull()
    expect(resolveGuard('/login', withoutOrg)).toBe('/onboarding')
  })

  it('keeps users with an organization out of onboarding, login and signup', () => {
    expect(resolveGuard('/onboarding', withOrg)).toBe('/app')
    expect(resolveGuard('/login', withOrg)).toBe('/app')
    expect(resolveGuard('/signup', withOrg)).toBe('/app')
    expect(resolveGuard('/', withOrg)).toBe('/app')
    expect(resolveGuard('/app/settings/members', withOrg)).toBeNull()
  })

  it('lets signed-in users reach invitations with or without an organization', () => {
    expect(resolveGuard('/accept-invitation/i1', withOrg)).toBeNull()
    expect(resolveGuard('/accept-invitation/i1', withoutOrg)).toBeNull()
  })

  it('honours a safe redirect when a signed-in user lands on login', () => {
    expect(resolveGuard('/login', withoutOrg, '/accept-invitation/i1')).toBe('/accept-invitation/i1')
    expect(resolveGuard('/login', withoutOrg, '//evil.example')).toBe('/onboarding')
  })
})

describe('public careers pages', () => {
  it('recognises them', () => {
    expect(isPublicPath('/careers/acme')).toBe(true)
    expect(isPublicPath('/careers/acme/backend-1')).toBe(true)
    expect(isPublicPath('/careersx')).toBe(false)
    expect(isPublicPath('/app/careers/acme')).toBe(false)
    expect(isPublicPath('/consent/tok123')).toBe(true)
    expect(isPublicPath('/consent')).toBe(false)
    expect(isPublicPath('/feedback/tok123')).toBe(true)
    expect(isPublicPath('/feedback')).toBe(false)
  })

  it('lets anonymous visitors through', () => {
    expect(resolveGuard('/careers/acme', null)).toBeNull()
  })

  it('does not redirect signed-in users, with or without organization', () => {
    expect(resolveGuard('/careers/acme/job-1', withOrg)).toBeNull()
    expect(resolveGuard('/careers/acme', withoutOrg)).toBeNull()
  })
})
