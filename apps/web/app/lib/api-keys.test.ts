import { MACHINE_FORBIDDEN_PERMISSIONS, PERMISSIONS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPIRY, EXPIRY_CHOICES, expiryDate, keyStatus, mcpConfigSnippet, mcpEndpoint, scopeGroups, scopeLabelKey, toggleScope, validateKeyForm } from './api-keys'

const NOW = new Date('2026-10-13T10:00:00.000Z')

describe('scopeGroups', () => {
  it('offers only what the role holds minus what a machine may never do, grouped by area', () => {
    const groups = scopeGroups('owner')
    const offered = groups.flatMap((group) => group.scopes)
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.filter((scope) => MACHINE_FORBIDDEN_PERMISSIONS.includes(scope))).toEqual([])
    expect(offered).toContain('job:create')
    expect(offered).toContain('candidate:read')
    expect(offered).not.toContain('message:send')
    expect(offered).not.toContain('candidate:decide')
    expect(groups.map((group) => group.area)).toEqual(['jobs', 'candidates', 'communication', 'work', 'reports', 'organization'])
    expect(groups.every((group) => group.scopes.length > 0)).toBe(true)
  })

  it('never offers more than the role holds and drops empty areas', () => {
    const groups = scopeGroups('interviewer')
    expect(groups.flatMap((group) => group.scopes)).toEqual(['job:read', 'job_team:read', 'candidate:read', 'candidate_note:create', 'feedback:read', 'message:read', 'task:read'])
    expect(groups.map((group) => group.area)).not.toContain('organization')
  })

  it('offers nothing without a role', () => {
    expect(scopeGroups(null)).toEqual([])
  })
})

describe('scopeLabelKey', () => {
  it('builds one key per permission', () => {
    expect(scopeLabelKey('job:create')).toBe('apiKeys.scope.job.create')
    expect(new Set(PERMISSIONS.map(scopeLabelKey)).size).toBe(PERMISSIONS.length)
  })
})

describe('toggleScope', () => {
  it('adds and removes without touching the input', () => {
    const start = ['job:read'] as const
    expect(toggleScope(start, 'job:create')).toEqual(['job:read', 'job:create'])
    expect(toggleScope(start, 'job:read')).toEqual([])
    expect(start).toEqual(['job:read'])
  })
})

describe('validateKeyForm', () => {
  it('asks for a name and at least one scope', () => {
    expect(validateKeyForm({ name: '  ', scopes: [], expiry: '90' })).toEqual({ name: 'apiKeys.errors.nameRequired', scopes: 'apiKeys.errors.scopesRequired' })
    expect(validateKeyForm({ name: 'x'.repeat(81), scopes: ['job:read'], expiry: '90' })).toEqual({ name: 'apiKeys.errors.nameTooLong' })
    expect(validateKeyForm({ name: 'CI', scopes: ['job:read'], expiry: '30' })).toEqual({})
  })
})

describe('expiryDate', () => {
  it('turns a choice into an ISO date: every key expires, at most after a year', () => {
    expect(EXPIRY_CHOICES).toEqual(['30', '90', '180', '365'])
    expect(DEFAULT_EXPIRY).toBe('90')
    expect(expiryDate('30', NOW)).toBe('2026-11-12T10:00:00.000Z')
    expect(expiryDate('365', NOW)).toBe('2027-10-13T10:00:00.000Z')
  })
})

describe('keyStatus', () => {
  const key = { revokedAt: null, expiresAt: null }
  it('reads revoked first, then expired, else active', () => {
    expect(keyStatus(key, NOW)).toBe('active')
    expect(keyStatus({ ...key, expiresAt: '2026-10-14T00:00:00.000Z' }, NOW)).toBe('active')
    expect(keyStatus({ ...key, expiresAt: '2026-10-12T00:00:00.000Z' }, NOW)).toBe('expired')
    expect(keyStatus({ revokedAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-12T00:00:00.000Z' }, NOW)).toBe('revoked')
  })
})

describe('mcp', () => {
  it('builds the endpoint from the site url', () => {
    expect(mcpEndpoint('https://ats.example.com/')).toBe('https://ats.example.com/mcp')
    expect(mcpEndpoint('http://localhost:3000')).toBe('http://localhost:3000/mcp')
  })

  it('writes a client config with a bearer header and a slug server name', () => {
    const snippet = mcpConfigSnippet({ serverName: 'Il Mio ATS!', url: 'https://ats.example.com/mcp', token: 'candydati_LA_TUA_CHIAVE' })
    const parsed = JSON.parse(snippet) as { mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }> }
    expect(Object.keys(parsed.mcpServers)).toEqual(['il-mio-ats'])
    expect(parsed.mcpServers['il-mio-ats']).toEqual({ type: 'http', url: 'https://ats.example.com/mcp', headers: { Authorization: 'Bearer candydati_LA_TUA_CHIAVE' } })
  })

  it('falls back to a neutral server name', () => {
    expect(Object.keys((JSON.parse(mcpConfigSnippet({ serverName: '  ', url: 'u', token: 't' })) as { mcpServers: object }).mcpServers)).toEqual(['ats'])
  })
})
