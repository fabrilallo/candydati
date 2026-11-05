import { describe, expect, it } from 'vitest'
import { defaultOrganizationId, grantedScope, oauthFailureKey, oauthQueryOf, offersProposeMove, redirectHost, safeNextUrl } from './oauth-flow'

const org = (id: string, overrides: Partial<{ active: boolean; twoFactorRequired: boolean }> = {}) => ({
  id,
  name: id,
  role: 'recruiter' as const,
  active: false,
  twoFactorRequired: false,
  ...overrides,
})

describe('oauthQueryOf', () => {
  it('keeps the query exactly as received, without the leading question mark', () => {
    expect(oauthQueryOf('?client_id=c1&scope=mcp%20offline_access&sig=a%2Bb')).toBe('client_id=c1&scope=mcp%20offline_access&sig=a%2Bb')
    expect(oauthQueryOf('client_id=c1')).toBe('client_id=c1')
  })

  it('is null when there is nothing to send or far too much', () => {
    expect(oauthQueryOf('')).toBeNull()
    expect(oauthQueryOf('?')).toBeNull()
    expect(oauthQueryOf(`?a=${'x'.repeat(9000)}`)).toBeNull()
  })
})

describe('safeNextUrl', () => {
  it('follows http(s) addresses and same-origin paths', () => {
    expect(safeNextUrl('https://claude.ai/api/mcp/auth_callback?code=x&state=y')).toBe('https://claude.ai/api/mcp/auth_callback?code=x&state=y')
    expect(safeNextUrl('http://localhost:6274/callback?code=x')).toBe('http://localhost:6274/callback?code=x')
    expect(safeNextUrl('/oauth/consent?a=1')).toBe('/oauth/consent?a=1')
  })

  it('refuses anything else', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', '/\\evil.example', 'oauth/consent', '', 'cursor://callback', null, 42]) {
      expect(safeNextUrl(url), String(url)).toBeNull()
    }
  })
})

describe('redirectHost', () => {
  it('shows only the host the answer goes to', () => {
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai')
    expect(redirectHost('http://127.0.0.1:6274/cb')).toBe('127.0.0.1:6274')
  })

  it('is null for something that is not an address', () => {
    expect(redirectHost('not a url')).toBeNull()
  })
})

describe('defaultOrganizationId', () => {
  it('prefers the active organization, else the first one', () => {
    expect(defaultOrganizationId([org('a'), org('b', { active: true })])).toBe('b')
    expect(defaultOrganizationId([org('a'), org('b')])).toBe('a')
  })

  it('skips an organization the person cannot connect yet when another one works', () => {
    expect(defaultOrganizationId([org('a'), org('b', { active: true, twoFactorRequired: true })])).toBe('a')
    expect(defaultOrganizationId([org('a', { twoFactorRequired: true })])).toBe('a')
  })

  it('is null without organizations', () => {
    expect(defaultOrganizationId([])).toBeNull()
  })
})

describe('oauthFailureKey', () => {
  it('names the codes the consent can answer with', () => {
    expect(oauthFailureKey({ status: 403, code: 'TWO_FACTOR_REQUIRED', message: null, issues: [] })).toBe('oauth.errors.twoFactorRequired')
    expect(oauthFailureKey({ status: 403, code: 'two_factor_required', message: null, issues: [] })).toBe('oauth.errors.twoFactorRequired')
    expect(oauthFailureKey({ status: 403, code: 'NOT_A_MEMBER', message: null, issues: [] })).toBe('oauth.errors.notAMember')
    expect(oauthFailureKey({ status: 403, code: 'NO_ACTIVE_ORGANIZATION', message: null, issues: [] })).toBe('oauth.errors.noOrganization')
  })

  it('treats a refused or unknown request as expired, and keeps the generic keys otherwise', () => {
    expect(oauthFailureKey({ status: 400, code: 'invalid_request', message: null, issues: [] })).toBe('oauth.errors.expired')
    expect(oauthFailureKey({ status: 401, code: null, message: null, issues: [] })).toBe('oauth.errors.expired')
    expect(oauthFailureKey({ status: 404, code: null, message: null, issues: [] })).toBe('oauth.errors.expired')
    expect(oauthFailureKey({ status: 422, code: 'validation_failed', message: null, issues: [] })).toBe('oauth.errors.expired')
    expect(oauthFailureKey({ status: 0, code: null, message: null, issues: [] })).toBe('errors.unreachable')
    expect(oauthFailureKey({ status: 500, code: null, message: null, issues: [] })).toBe('errors.unreachable')
    expect(oauthFailureKey({ status: 429, code: null, message: null, issues: [] })).toBe('errors.tooManyRequests')
  })
})

describe('the opt-in to propose moves', () => {
  const asked = ['mcp', 'candidate:propose_move', 'offline_access']

  it('is offered only when the app asked for it and the role may move', () => {
    expect(offersProposeMove(asked, 'recruiter')).toBe(true)
    expect(offersProposeMove(asked, 'interviewer')).toBe(false)
    expect(offersProposeMove(['mcp', 'offline_access'], 'owner')).toBe(false)
  })

  it('is left out of the grant unless the person ticked it, and nothing is added that was not asked', () => {
    expect(grantedScope(asked, 'recruiter', false)).toBe('mcp offline_access')
    expect(grantedScope(asked, 'recruiter', true)).toBe('mcp candidate:propose_move offline_access')
    expect(grantedScope(asked, 'interviewer', true)).toBe('mcp offline_access')
    expect(grantedScope(['mcp'], 'owner', true)).toBe('mcp')
  })
})
