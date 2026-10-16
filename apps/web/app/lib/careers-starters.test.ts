import { careersSectionSchema, SECTION_TYPES, type SectionType } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { starterSection } from './careers-starters'

const tr = (key: string) => `[${key}]`
const ADDABLE = SECTION_TYPES.filter((type): type is Exclude<SectionType, 'jobs'> => type !== 'jobs')

describe('starterSection', () => {
  it('writes the required text in the editing language', () => {
    const hero = starterSection('hero', 'hero', tr, 'en')
    expect(hero).toMatchObject({ type: 'hero', headline: { en: '[careersEditor.starter.hero.headline]' }, background: { kind: 'none' } })
    const values = starterSection('values', 'values-1', tr, 'it')
    expect(values.type === 'values' && values.items.map((item) => item.title)).toEqual([1, 2, 3].map((index) => ({ it: `[careersEditor.starter.values.item${index}]` })))
  })

  it('is valid where nothing must come from the organization, and waits for it elsewhere', () => {
    const valid = ADDABLE.filter((type) => careersSectionSchema.safeParse(starterSection(type, `${type.replace('_', '-')}-1`, tr, 'it')).success)
    expect(valid.sort()).toEqual(['hero', 'text', 'values'])
  })
})
