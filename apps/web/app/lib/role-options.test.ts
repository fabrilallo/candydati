import { CUSTOM_ROLE, JOB_ROLES } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { roleOptions } from './role-options'

describe('roleOptions', () => {
  const options = roleOptions((key) => key)

  it('lists every taxonomy role, grouped by family', () => {
    expect(options.slice(0, -1).map((option) => option.value)).toEqual([...JOB_ROLES])
    expect(options.slice(0, -1).every((option) => option.group !== undefined)).toBe(true)
  })

  it('ends with the ungrouped option to write a new role', () => {
    expect(options.at(-1)).toEqual({ value: CUSTOM_ROLE, label: 'taxonomy.roleOther' })
  })
})
