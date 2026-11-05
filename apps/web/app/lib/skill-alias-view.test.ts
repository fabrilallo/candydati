import { describe, expect, it } from 'vitest'
import { filterBuiltIn, validateSkillAliasForm } from './skill-alias-view'

const entries = [
  { id: 'go', name: 'Go', aliases: [{ alias: 'golang', enabled: true }] },
  { id: 'kubernetes', name: 'Kubernetes', aliases: [{ alias: 'k8s', enabled: false }] },
  { id: 'contabilita', name: 'Contabilità', aliases: [{ alias: 'accounting', enabled: true }] },
]

describe('filterBuiltIn', () => {
  it('keeps everything for an empty query and narrows by name or alias, ignoring case, punctuation and accents', () => {
    expect(filterBuiltIn(entries, '  ')).toHaveLength(3)
    expect(filterBuiltIn(entries, 'GOLANG').map((entry) => entry.id)).toEqual(['go'])
    expect(filterBuiltIn(entries, 'K-8-s').map((entry) => entry.id)).toEqual(['kubernetes'])
    expect(filterBuiltIn(entries, 'contabilita').map((entry) => entry.id)).toEqual(['contabilita'])
    expect(filterBuiltIn(entries, 'zzz')).toEqual([])
  })
})

describe('validateSkillAliasForm', () => {
  it('asks for both fields, with something readable, within the limit', () => {
    expect(validateSkillAliasForm({ skill: 'Go', alias: 'Go developer' })).toEqual({})
    expect(validateSkillAliasForm({ skill: ' ', alias: '?!' })).toEqual({ skill: 'skills.errors.required', alias: 'skills.errors.required' })
    expect(validateSkillAliasForm({ skill: 'Go', alias: 'x'.repeat(61) })).toEqual({ alias: 'skills.errors.tooLong' })
  })
})
