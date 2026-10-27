import { describe, expect, it } from 'vitest'
import { roleLabel } from './role-label'

const tr = (key: string): string => `t:${key}`

describe('roleLabel', () => {
  it('translates a taxonomy role', () => {
    expect(roleLabel('backend_developer', null, tr)).toBe('t:taxonomy.roles.backend_developer')
  })

  it('shows the text the person wrote for a custom role', () => {
    expect(roleLabel('other', 'Pastry chef', tr)).toBe('Pastry chef')
  })

  it('falls back to the generic label while a custom role has no text yet', () => {
    expect(roleLabel('other', '  ', tr)).toBe('t:taxonomy.roleOther')
    expect(roleLabel('other', undefined, tr)).toBe('t:taxonomy.roleOther')
  })

  it('ignores stale custom text when the role is in the list', () => {
    expect(roleLabel('recruiter', 'Old text', tr)).toBe('t:taxonomy.roles.recruiter')
  })

  it('is empty without a role', () => {
    expect(roleLabel(undefined, null, tr)).toBe('')
    expect(roleLabel('', null, tr)).toBe('')
  })
})
