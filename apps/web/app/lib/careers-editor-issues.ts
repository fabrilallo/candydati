import { careersPageDocumentSchema, SUPPORTED_LOCALES, type CareersPageDocument } from '@candydati/domain'

/**
 * Validation of the draft, shaped for the editor: each issue of `careersPageDocumentSchema` lands on its section and
 * field (`headline`, `images.0.alt`, `source.videoId`), with a code that has its own message
 * (`careersEditor.errors.<code>`). Same schema as the api, so what the editor accepts the api accepts.
 */

export type FieldIssues = Readonly<Record<string, string>>

export interface EditorIssues {
  /** By section id, then by field path (`''` = the section as a whole). */
  readonly sections: Readonly<Record<string, FieldIssues>>
  /** Issues of the page: `theme.accent`, `defaultLocale`, `sections` (structure). */
  readonly page: FieldIssues
  readonly count: number
}

export const ISSUE_CODES = [
  'required',
  'too_long',
  'gallery_min',
  'gallery_max',
  'values_min',
  'values_max',
  'numbers_min',
  'numbers_max',
  'testimonials_min',
  'testimonials_max',
  'links_min',
  'links_max',
  'jobs_exactly_one',
  'hero_first',
  'hero_at_most_one',
  'overlay_too_low',
  'accent_contrast',
  'hex_color',
  'media_missing',
  'media_required',
  'video_id',
  'video_url',
  'url',
  'duplicate_id',
  'section_id',
  'too_many_sections',
  'invalid',
] as const
export type IssueCode = (typeof ISSUE_CODES)[number]

const KNOWN: ReadonlySet<string> = new Set(ISSUE_CODES)
const LOCALES: ReadonlySet<PropertyKey> = new Set(SUPPORTED_LOCALES)

/** The field an issue belongs to: its path inside the section, without the language of a localized text. */
export const fieldKey = (path: readonly PropertyKey[]): string => {
  const last = path.at(-1)
  const trimmed = last !== undefined && LOCALES.has(last) ? path.slice(0, -1) : path
  return trimmed.map(String).join('.')
}

/** A code with a message of its own; the schema's generic messages (an empty id, a malformed URL) by field. */
export const issueCode = (message: string, field: string): IssueCode => {
  if (KNOWN.has(message)) return message as IssueCode
  if (/(?:^|\.)\w*Id$/.test(field)) return 'media_required'
  if (/(?:^|\.)url$/.test(field)) return 'url'
  return 'invalid'
}

export const issueKey = (code: string): string => `careersEditor.errors.${code}`

interface Placed {
  readonly sectionId: string | null
  readonly field: string
  readonly code: IssueCode
}

const place = (document: CareersPageDocument, path: readonly PropertyKey[], message: string): Placed => {
  const [head, index, ...rest] = path
  const section = head === 'sections' && typeof index === 'number' ? document.sections[index] : undefined
  if (!section) {
    const field = fieldKey(path)
    return { sectionId: null, field, code: issueCode(message, field) }
  }
  const field = fieldKey(rest)
  return { sectionId: section.id, field, code: issueCode(message, field) }
}

const withFirst = (issues: FieldIssues, field: string, code: string): FieldIssues => (field in issues ? issues : { ...issues, [field]: code })

export const NO_ISSUES: EditorIssues = { sections: {}, page: {}, count: 0 }

export const editorIssues = (document: CareersPageDocument): EditorIssues => {
  const parsed = careersPageDocumentSchema.safeParse(document)
  if (parsed.success) return NO_ISSUES
  return parsed.error.issues.reduce<EditorIssues>((acc, issue) => {
    const placed = place(document, issue.path, issue.message)
    if (placed.sectionId === null) return { ...acc, page: withFirst(acc.page, placed.field, placed.code), count: acc.count + 1 }
    const current = acc.sections[placed.sectionId] ?? {}
    return { ...acc, sections: { ...acc.sections, [placed.sectionId]: withFirst(current, placed.field, placed.code) }, count: acc.count + 1 }
  }, NO_ISSUES)
}

/** Issue codes of a field and of everything under it (`images` covers `images.0.alt`). */
export const issuesUnder = (issues: FieldIssues | undefined, prefix: string): FieldIssues =>
  Object.fromEntries(Object.entries(issues ?? {}).filter(([field]) => field === prefix || field.startsWith(`${prefix}.`)))

/** The first section with an issue, to bring it into view after a refused save. */
export const firstSectionWithIssues = (document: CareersPageDocument, issues: EditorIssues): string | null =>
  document.sections.find((section) => Object.keys(issues.sections[section.id] ?? {}).length > 0)?.id ?? null
