import { CAREERS_LIMITS, type CareersSection } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { defaultDocument, fixtureDocument } from '~~/test/fixtures/careers-editor-fixtures'
import {
  ADDABLE_TYPES,
  addableTypes,
  addSection,
  canAddSection,
  canMoveTo,
  canRemoveSection,
  dropIndex,
  insertIndex,
  moveItem,
  moveSection,
  removeAt,
  removeSection,
  replaceAt,
  sectionTitle,
  setText,
  toggleSection,
  uniqueSectionId,
  updateSection,
  type EditorDocument,
} from './careers-editor'

const text = (id: string): CareersSection => ({ id, type: 'text', visible: true, title: {}, body: { it: 'x' } })
const ids = (document: EditorDocument) => document.sections.map((section) => section.id)
const withoutHero = (document: EditorDocument): EditorDocument => ({ ...document, sections: document.sections.filter((section) => section.type !== 'hero') })

describe('addable types', () => {
  it('never offers jobs, and offers the hero only while there is none', () => {
    expect(ADDABLE_TYPES).not.toContain('jobs')
    expect(addableTypes(defaultDocument())).not.toContain('hero')
    expect(addableTypes(withoutHero(defaultDocument()))).toContain('hero')
  })

  it('stops at the section limit', () => {
    const full = { ...defaultDocument(), sections: Array.from({ length: CAREERS_LIMITS.sections }, (_, index) => text(`t-${index}`)) }
    expect(canAddSection(full)).toBe(false)
    expect(addSection(full, text('extra'))).toBe(full)
  })
})

describe('uniqueSectionId', () => {
  it('slugs the type and takes the first free counter', () => {
    const document = addSection(defaultDocument(), text('text-1'))
    expect(uniqueSectionId(document, 'text')).toBe('text-2')
    expect(uniqueSectionId(document, 'image_text')).toBe('image-text-1')
  })
})

describe('addSection', () => {
  it('puts a new section after the selected one, never above the hero, else at the end', () => {
    const base = defaultDocument()
    expect(ids(addSection(base, text('a')))).toEqual(['hero', 'jobs', 'a'])
    expect(ids(addSection(base, text('a'), 'hero'))).toEqual(['hero', 'a', 'jobs'])
    expect(ids(addSection(base, text('a'), 'missing'))).toEqual(['hero', 'jobs', 'a'])
    expect(insertIndex(base, 'text', 'hero')).toBe(1)
  })

  it('puts a hero first, refuses a second one and never adds jobs', () => {
    const base = withoutHero(defaultDocument())
    const hero = defaultDocument().sections[0]!
    expect(ids(addSection(base, hero, 'jobs'))).toEqual(['hero', 'jobs'])
    const withHero = defaultDocument()
    expect(addSection(withHero, hero)).toBe(withHero)
    expect(addSection(withHero, { id: 'jobs-2', type: 'jobs', visible: true, title: {}, intro: {} })).toBe(withHero)
  })

  it('leaves the input untouched', () => {
    const base = defaultDocument()
    const snapshot = JSON.stringify(base)
    addSection(base, text('a'))
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('moving sections', () => {
  const page = fixtureDocument()

  it('moves a section and keeps the others in order', () => {
    expect(ids(moveSection(page, 'jobs', 1)).slice(0, 3)).toEqual(['hero', 'jobs', 'chi-siamo'])
    expect(ids(moveSection(page, 'chi-siamo', 9)).at(-1)).toBe('chi-siamo')
  })

  it('never moves the hero, nor anything above it', () => {
    expect(canMoveTo(page, 0, 1)).toBe(false)
    expect(canMoveTo(page, 1, 0)).toBe(false)
    expect(moveSection(page, 'hero', 3)).toBe(page)
    expect(moveSection(page, 'chi-siamo', 0)).toBe(page)
  })

  it('refuses positions out of range and unknown ids', () => {
    expect(canMoveTo(page, 1, 1)).toBe(false)
    expect(canMoveTo(page, 1, 99)).toBe(false)
    expect(canMoveTo(page, -1, 2)).toBe(false)
    expect(moveSection(page, 'nope', 2)).toBe(page)
    const free = withoutHero(page)
    expect(canMoveTo(free, 1, 0)).toBe(true)
  })
})

describe('removing and hiding', () => {
  it('removes any section but jobs', () => {
    const page = fixtureDocument()
    expect(ids(removeSection(page, 'chi-siamo'))).not.toContain('chi-siamo')
    expect(removeSection(page, 'jobs')).toBe(page)
    expect(removeSection(page, 'missing')).toBe(page)
    expect(canRemoveSection(page.sections.find((section) => section.type === 'jobs')!)).toBe(false)
  })

  it('toggles visibility, jobs included', () => {
    const page = toggleSection(fixtureDocument(), 'jobs')
    expect(page.sections.find((section) => section.id === 'jobs')?.visible).toBe(false)
    expect(toggleSection(page, 'jobs').sections.find((section) => section.id === 'jobs')?.visible).toBe(true)
  })
})

describe('updateSection and setText', () => {
  it('patches one section as a new object', () => {
    const base = defaultDocument()
    const next = updateSection<'hero'>(base, 'hero', { headline: setText({}, 'it', 'Ciao') })
    expect(next.sections[0]).toMatchObject({ headline: { it: 'Ciao' } })
    expect(base.sections[0]).not.toBe(next.sections[0])
    expect(next.sections[1]).toBe(base.sections[1])
  })

  it('drops a language when its text is emptied', () => {
    expect(setText({ it: 'a', en: 'b' }, 'it', '')).toEqual({ en: 'b' })
    expect(setText({ en: 'b' }, 'it', 'c')).toEqual({ en: 'b', it: 'c' })
  })
})

describe('list helpers', () => {
  it('moves, removes and replaces without mutating', () => {
    const list = ['a', 'b', 'c'] as const
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(list, 0, 5)).toBe(list)
    expect(removeAt(list, 1)).toEqual(['a', 'c'])
    expect(replaceAt(list, 1, 'x' as never)).toEqual(['a', 'x', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('sectionTitle', () => {
  it('reads the headline or title in the editing language, with fallbacks, else null', () => {
    const page = fixtureDocument()
    expect(sectionTitle(page.sections[0]!, 'en', 'it')).toBe('We build software that matters')
    expect(sectionTitle(page.sections[1]!, 'en', 'it')).toBe('Chi siamo')
    expect(sectionTitle(page.sections.find((section) => section.type === 'numbers')!, 'it', 'it')).toBeNull()
  })
})

describe('dropIndex', () => {
  const rows = [0, 40, 80, 120].map((top) => ({ top, height: 40 }))
  it('lands before the first row whose middle is below the pointer', () => {
    expect(dropIndex(5, rows, 3)).toBe(0)
    expect(dropIndex(70, rows, 0)).toBe(1)
    expect(dropIndex(500, rows, 0)).toBe(3)
    expect(dropIndex(10, rows, 0)).toBe(0)
  })
})
