import type { JobForm, StageForm } from './job-form'

/**
 * One-click fixes for the compliance findings (pure). The domain says what is wrong and why; here the editor turns it
 * into a change of the form: add "(m/f)", use the inclusive title, take the offending words out, write the legal
 * sentence. Every fix returns a patch, never a mutated form.
 */
export interface ComplianceFix {
  /** Translation key of the button. */
  readonly labelKey: string
  readonly params: Readonly<Record<string, string>>
  readonly patch: Partial<JobForm>
}

export interface FixableIssue {
  readonly rule: string
  readonly path: string
  readonly match: string
  readonly suggestion: string
}

const TEXT_FIELDS = ['title', 'summary', 'growth', 'workLifeBalance', 'culture'] as const
type TextField = (typeof TEXT_FIELDS)[number]
const LIST_FIELDS: Readonly<Record<string, 'responsibilities' | 'mustHave' | 'niceToHave' | 'benefits'>> = {
  responsibilities: 'responsibilities',
  'requirements.mustHave': 'mustHave',
  'requirements.niceToHave': 'niceToHave',
  benefits: 'benefits',
}

/** Where a content path lives in the form. Process notes count only the stages that are sent (blank rows are not). */
type Slot =
  | { readonly kind: 'text'; readonly field: TextField | 'bonus' }
  | { readonly kind: 'list'; readonly field: 'responsibilities' | 'mustHave' | 'niceToHave' | 'benefits'; readonly index: number }
  | { readonly kind: 'note'; readonly index: number }

export const slotOf = (path: string): Slot | null => {
  if ((TEXT_FIELDS as readonly string[]).includes(path)) return { kind: 'text', field: path as TextField }
  if (path === 'employment.bonus') return { kind: 'text', field: 'bonus' }
  const note = /^process\.(\d+)\.note$/.exec(path)
  if (note) return { kind: 'note', index: Number(note[1]) }
  const list = /^(.*)\.(\d+)$/.exec(path)
  const field = list ? LIST_FIELDS[list[1] ?? ''] : undefined
  return list && field ? { kind: 'list', field, index: Number(list[2]) } : null
}

const isBlankStage = (stage: StageForm): boolean => [stage.type, stage.durationMinutes, stage.conductedBy, stage.note, stage.title].every((value) => value.trim() === '')
/** Index in `form.process` of the n-th stage that is sent. */
const formStageIndex = (process: readonly StageForm[], sentIndex: number): number => {
  const sent = process.map((stage, index) => ({ stage, index })).filter(({ stage }) => !isBlankStage(stage))
  return sent[sentIndex]?.index ?? -1
}

/** The text the path points at, or null when the form no longer has it. */
export const textAt = (form: JobForm, path: string): string | null => {
  const slot = slotOf(path)
  if (slot === null) return null
  if (slot.kind === 'text') return form[slot.field]
  if (slot.kind === 'list') return form[slot.field][slot.index] ?? null
  return form.process[formStageIndex(form.process, slot.index)]?.note ?? null
}

/** The patch that writes `next` (or removes the list item when `next` is null) at `path`. */
export const patchAt = (form: JobForm, path: string, next: string | null): Partial<JobForm> => {
  const slot = slotOf(path)
  if (slot === null) return {}
  if (slot.kind === 'text') return { [slot.field]: next ?? '' }
  if (slot.kind === 'list') {
    const items = form[slot.field]
    return { [slot.field]: next === null ? items.filter((_, i) => i !== slot.index) : items.map((item, i) => (i === slot.index ? next : item)) }
  }
  const at = formStageIndex(form.process, slot.index)
  return { process: form.process.map((stage, i) => (i === at ? { ...stage, note: next ?? '' } : stage)) }
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Case- and accent-insensitive position of `match` in `text` (same length after folding, see the domain's `fold`). */
const indexOf = (text: string, match: string): number => fold(text).indexOf(fold(match))

/** Removes `match` and tidies what is left: no double spaces, no dangling commas or opening punctuation. */
export const removePhrase = (text: string, match: string): string => {
  const at = indexOf(text, match)
  if (at < 0 || match.trim() === '') return text
  // An age limit names its number after the words ("età massima 35 anni"): it goes with them.
  const after = text.slice(at + match.length)
  const tail = /^\s*(?:di\s+)?\d+(?:\s*(?:anni|years(?:\s+old)?))?/i.exec(after)?.[0] ?? ''
  return `${text.slice(0, at)} ${after.slice(tail.length)}`
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:.-]+/, '')
    .replace(/[\s,;:-]+$/, '')
    .trim()
}

/** Keeps the capital of the original when the replacement starts a sentence. */
const keepCase = (original: string, replacement: string): string =>
  original.charAt(0) === original.charAt(0).toUpperCase() && original.charAt(0) !== original.charAt(0).toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement

export const replacePhrase = (text: string, match: string, replacement: string): string => {
  const at = indexOf(text, match)
  return at < 0 ? text : `${text.slice(0, at)}${keepCase(text.slice(at, at + match.length), replacement)}${text.slice(at + match.length)}`
}

/** Inclusive rewrites of the masculine phrasings the domain warns about. */
const INCLUSIVE: readonly (readonly [RegExp, string])[] = [
  [/^il candidato ideale$/, 'la persona ideale'],
  [/^il candidato$/, 'il/la candidato/a'],
  [/^sara (inserito|affiancato|formato)$/, 'sarà $1/a'],
  [/^il neoassunto$/, 'la persona neoassunta'],
  [/^il nuovo collega$/, 'la nuova persona del team'],
  [/^il professionista$/, 'il/la professionista'],
]
const inclusiveOf = (match: string): string | null => {
  const folded = fold(match).replace(/\s+/g, ' ').trim()
  const found = INCLUSIVE.find(([pattern]) => pattern.test(folded))
  return found ? folded.replace(found[0], found[1]) : null
}

const PROTECTED_SENTENCE: Readonly<Record<string, string>> = {
  it: 'iscritti alle liste del collocamento mirato ai sensi della L. 68/99',
  en: 'people registered in the targeted placement lists under Italian Law 68/99',
}

/** Fewer than four letters left: the item said nothing else, so it goes. */
const isEmptied = (text: string): boolean => (text.match(/\p{L}/gu) ?? []).length < 4

const removal = (form: JobForm, issue: FixableIssue, text: string): ComplianceFix => {
  const rest = removePhrase(text, issue.match)
  const slot = slotOf(issue.path)
  const dropItem = slot?.kind === 'list' && isEmptied(rest)
  return {
    labelKey: dropItem ? 'job.compliance.fix.removeItem' : 'job.compliance.fix.remove',
    params: { text: issue.match },
    patch: patchAt(form, issue.path, dropItem ? null : rest),
  }
}

const titleFixes = (form: JobForm, issue: FixableIssue): readonly ComplianceFix[] => {
  const marked: ComplianceFix = { labelKey: 'job.compliance.fix.addMarker', params: { marker: '(m/f)' }, patch: { title: `${form.title.trim()} (m/f)` } }
  const inclusive = issue.suggestion.trim()
  const useSuggestion = inclusive !== '' && inclusive !== form.title.trim() && !inclusive.endsWith('(m/f)')
  return useSuggestion ? [marked, { labelKey: 'job.compliance.fix.useTitle', params: { title: inclusive }, patch: { title: inclusive } }] : [marked]
}

const rewrite = (form: JobForm, issue: FixableIssue, text: string): readonly ComplianceFix[] => {
  const inclusive = inclusiveOf(issue.match)
  return inclusive === null ? [] : [{ labelKey: 'job.compliance.fix.replace', params: { text: inclusive }, patch: patchAt(form, issue.path, replacePhrase(text, issue.match, inclusive)) }]
}

/**
 * Pure: the fixes offered for a finding, best first; empty when the editor cannot fix it in one click (the
 * explanation still says what to write).
 */
export const fixesFor = (form: JobForm, issue: FixableIssue): readonly ComplianceFix[] => {
  const text = textAt(form, issue.path)
  if (text === null || indexOf(text, issue.match) < 0) return []
  if (issue.rule === 'gender_exclusive_title') return titleFixes(form, issue)
  if (issue.rule === 'gender_masculine_phrasing') return rewrite(form, issue, text)
  if (issue.rule === 'protected_categories_wording') {
    const sentence = PROTECTED_SENTENCE[form.language] ?? PROTECTED_SENTENCE.it ?? ''
    return [{ labelKey: 'job.compliance.fix.legalWording', params: {}, patch: patchAt(form, issue.path, replacePhrase(text, issue.match, sentence)) }]
  }
  return [removal(form, issue, text)]
}
