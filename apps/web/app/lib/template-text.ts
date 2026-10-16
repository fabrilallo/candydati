import { isTemplateVariable } from '@candydati/domain'

/** `{{ name }}`, spaces optional; the same placeholders `renderTemplate` of `@candydati/domain` looks at. */
const VARIABLE_PATTERN = /\{\{([^{}]*)\}\}/g

/** Pure: a variable in the template syntax. */
export const variableToken = (name: string): string => `{{ ${name} }}`

export interface Insertion {
  readonly text: string
  /** Where the caret goes: right after what was inserted. */
  readonly cursor: number
}

const clamp = (value: number | null, max: number): number => (value === null ? max : Math.min(Math.max(value, 0), max))

/** Pure: `insertion` replaces the selection (or goes at the caret; at the end when the caret is unknown). */
export const insertAtCursor = (text: string, selectionStart: number | null, selectionEnd: number | null, insertion: string): Insertion => {
  const a = clamp(selectionStart, text.length)
  const b = clamp(selectionEnd ?? selectionStart, text.length)
  const [start, end] = a <= b ? [a, b] : [b, a]
  return { text: `${text.slice(0, start)}${insertion}${text.slice(end)}`, cursor: start + insertion.length }
}

export type TemplateSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'known' | 'unknown'; readonly value: string; readonly name: string }

/**
 * Pure: the text cut into plain parts and variables, so unknown ones can be highlighted. Without `unknown` the
 * known list decides; with it (the api's `unknownVariables`), only the names listed are unknown.
 */
export const templateSegments = (text: string, unknown?: readonly string[]): readonly TemplateSegment[] => {
  const isUnknown = (name: string): boolean => (unknown ? unknown.includes(name) : !isTemplateVariable(name))
  const segments: TemplateSegment[] = []
  let last = 0
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const at = match.index
    if (at > last) segments.push({ kind: 'text', value: text.slice(last, at) })
    const name = (match[1] ?? '').trim()
    segments.push({ kind: isUnknown(name) ? 'unknown' : 'known', value: match[0], name })
    last = at + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
  return segments
}
