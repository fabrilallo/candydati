import { CAREERS_LIMITS, resolveText, SECTION_TYPES, type CareersPageDocument, type CareersSection, type Locale, type LocalizedText, type SectionOf, type SectionType } from '@tt/domain'

/**
 * Pure editing of a careers page document (the editor's draft). Every function returns a new document and never
 * touches its input. The rules mirror `careersPageDocumentSchema`: the open positions (`jobs`) are always there, at
 * most one hero and, when there is one, it is the first section.
 */

export type EditorDocument = CareersPageDocument
export type SectionPatch<T extends SectionType = SectionType> = Partial<Omit<SectionOf<T>, 'id' | 'type'>>

/** Every type a person can add: `jobs` exists once and is never added or removed. */
export const ADDABLE_TYPES: readonly SectionType[] = SECTION_TYPES.filter((type) => type !== 'jobs')

const hasHero = (document: EditorDocument): boolean => document.sections.some((section) => section.type === 'hero')

export const addableTypes = (document: EditorDocument): readonly SectionType[] => ADDABLE_TYPES.filter((type) => type !== 'hero' || !hasHero(document))

export const canAddSection = (document: EditorDocument): boolean => document.sections.length < CAREERS_LIMITS.sections

/** Stable, url-safe id: the type as a slug plus the first counter not taken (`image-text-2`). */
export const uniqueSectionId = (document: EditorDocument, type: SectionType): string => {
  const used = new Set(document.sections.map((section) => section.id))
  const base = type.replace(/_/g, '-')
  let counter = 1
  while (used.has(`${base}-${counter}`)) counter += 1
  return `${base}-${counter}`
}

/** Where a new section goes: a hero first; anything else after `afterId` (never above the hero), else at the end. */
export const insertIndex = (document: EditorDocument, type: SectionType, afterId: string | null): number => {
  if (type === 'hero') return 0
  const floor = document.sections[0]?.type === 'hero' ? 1 : 0
  const after = afterId === null ? -1 : document.sections.findIndex((section) => section.id === afterId)
  return after >= 0 ? Math.max(floor, after + 1) : document.sections.length
}

export const addSection = (document: EditorDocument, section: CareersSection, afterId: string | null = null): EditorDocument => {
  if (!canAddSection(document) || section.type === 'jobs' || (section.type === 'hero' && hasHero(document))) return document
  const at = insertIndex(document, section.type, afterId)
  return { ...document, sections: [...document.sections.slice(0, at), section, ...document.sections.slice(at)] }
}

/** The hero never moves, and nothing moves above it. */
export const canMoveTo = (document: EditorDocument, from: number, to: number): boolean => {
  const sections = document.sections
  if (from < 0 || from >= sections.length || to < 0 || to >= sections.length || from === to) return false
  if (sections[from]?.type === 'hero') return false
  return !(to === 0 && sections[0]?.type === 'hero')
}

export const moveItem = <T>(list: readonly T[], from: number, to: number): readonly T[] => {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list
  const rest = list.filter((_, index) => index !== from)
  return [...rest.slice(0, to), list[from] as T, ...rest.slice(to)]
}

export const removeAt = <T>(list: readonly T[], index: number): readonly T[] => list.filter((_, at) => at !== index)

export const replaceAt = <T>(list: readonly T[], index: number, item: T): readonly T[] => list.map((current, at) => (at === index ? item : current))

export const sectionIndex = (document: EditorDocument, id: string): number => document.sections.findIndex((section) => section.id === id)

export const moveSection = (document: EditorDocument, id: string, to: number): EditorDocument => {
  const from = sectionIndex(document, id)
  if (!canMoveTo(document, from, to)) return document
  return { ...document, sections: moveItem(document.sections, from, to) as CareersSection[] }
}

export const canRemoveSection = (section: CareersSection): boolean => section.type !== 'jobs'

export const removeSection = (document: EditorDocument, id: string): EditorDocument => {
  const section = document.sections.find((candidate) => candidate.id === id)
  if (!section || !canRemoveSection(section)) return document
  return { ...document, sections: document.sections.filter((candidate) => candidate.id !== id) }
}

export const toggleSection = (document: EditorDocument, id: string): EditorDocument => ({
  ...document,
  sections: document.sections.map((section) => (section.id === id ? { ...section, visible: !section.visible } : section)),
})

export const updateSection = <T extends SectionType>(document: EditorDocument, id: string, patch: SectionPatch<T>): EditorDocument => ({
  ...document,
  sections: document.sections.map((section) => (section.id === id ? ({ ...section, ...patch } as CareersSection) : section)),
})

/** One language of a localized text, as a new object; an empty value removes that language. */
export const setText = (text: LocalizedText, locale: Locale, value: string): LocalizedText => {
  const rest = Object.fromEntries(Object.entries(text).filter(([code]) => code !== locale)) as LocalizedText
  return value === '' ? rest : { ...rest, [locale]: value }
}

/** What the list of sections calls a section: its title or headline in the editing language, else null (the type name). */
export const sectionTitle = (section: CareersSection, locale: Locale, fallback: Locale): string | null => {
  const text = section.type === 'hero' ? section.headline : section.title
  return resolveText(text, locale, fallback).trim() || null
}

export interface RowBox {
  readonly top: number
  readonly height: number
}

/** Pointer drag: the index the dragged row lands on, from the pointer's y and the rows' boxes (in list order). */
export const dropIndex = (y: number, rows: readonly RowBox[], from: number): number => {
  const before = rows.findIndex((row) => y < row.top + row.height / 2)
  const slot = before === -1 ? rows.length : before
  return slot > from ? slot - 1 : slot
}
