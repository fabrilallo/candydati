import { describe, expect, it } from 'vitest'
import { actorKind, actionLabelKey, auditDetails, targetLabel, type AuditEventView } from './audit-view'

const base: AuditEventView = {
  id: 'e1',
  organizationId: 'o1',
  actor: { type: 'user', id: 'u1', onBehalfOfUserId: null, name: 'Ada' },
  action: 'invitation.created',
  target: { type: 'invitation', id: 'inv_1234567890' },
  metadata: { role: 'recruiter', email: 'new@example.com', other: { secret: 1 } },
  occurredAt: '2026-10-13T10:00:00.000Z',
}

describe('actionLabelKey', () => {
  it('uses the translated label of known actions', () => {
    expect(actionLabelKey('member.role_changed')).toBe('audit.actions.member.role_changed')
  })

  it('falls back to a generic key for actions this build does not know', () => {
    expect(actionLabelKey('candidate.hired')).toBe('audit.actions.unknown')
  })
})

describe('actorKind', () => {
  it('separates people from agents, api keys and the system', () => {
    expect(actorKind(base.actor)).toBe('user')
    expect(actorKind({ ...base.actor, type: 'agent' })).toBe('agent')
    expect(actorKind({ ...base.actor, type: 'api_key' })).toBe('api_key')
    expect(actorKind({ ...base.actor, type: 'system', id: null })).toBe('system')
    expect(actorKind({ ...base.actor, type: 'robot' })).toBe('user')
  })
})

describe('auditDetails', () => {
  it('keeps only known, scalar metadata', () => {
    expect(auditDetails(base)).toEqual([
      { key: 'email', value: 'new@example.com' },
      { key: 'role', value: 'recruiter' },
    ])
  })

  it('is empty without metadata', () => {
    expect(auditDetails({ ...base, metadata: {} })).toEqual([])
  })
})

describe('targetLabel', () => {
  it('shortens long ids', () => {
    expect(targetLabel(base.target)).toEqual({ type: 'invitation', id: 'inv_1234…' })
    expect(targetLabel({ type: 'organization', id: 'o1' })).toEqual({ type: 'organization', id: 'o1' })
  })
})
