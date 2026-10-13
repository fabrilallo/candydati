import type { VaguePhrase } from '@tt/domain'

export interface TextPart {
  readonly text: string
  /** The vague phrase this part matches, `null` for plain text. */
  readonly phrase: VaguePhrase | null
}

interface Match {
  readonly start: number
  readonly end: number
  readonly phrase: VaguePhrase
}

const matchesOf = (text: string, phrase: VaguePhrase): readonly Match[] => {
  const needle = phrase.text.trim().toLocaleLowerCase()
  if (needle === '') return []
  const haystack = text.toLocaleLowerCase()
  const found: Match[] = []
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    found.push({ start: at, end: at + needle.length, phrase })
  }
  return found
}

/** Longest first, then leftmost: a longer phrase wins over the shorter ones it contains. */
const byPriority = (a: Match, b: Match): number => b.end - b.start - (a.end - a.start) || a.start - b.start

const nonOverlapping = (matches: readonly Match[]): readonly Match[] =>
  [...matches]
    .sort(byPriority)
    .reduce<Match[]>((kept, match) => (kept.some((other) => match.start < other.end && other.start < match.end) ? kept : [...kept, match]), [])
    .sort((a, b) => a.start - b.start)

/**
 * Pure: splits `text` into plain parts and parts that match a vague phrase found by the last analysis.
 * Case-insensitive, literal (no regex), never nested; the original spelling is kept.
 */
export const splitHighlights = (text: string, phrases: readonly VaguePhrase[]): readonly TextPart[] => {
  if (text === '') return []
  const matches = nonOverlapping(phrases.flatMap((phrase) => matchesOf(text, phrase)))
  const parts: TextPart[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) parts.push({ text: text.slice(cursor, match.start), phrase: null })
    parts.push({ text: text.slice(match.start, match.end), phrase: match.phrase })
    cursor = match.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), phrase: null })
  return parts
}

/** Pure: the phrases that actually occur in one of `texts` (the others cannot be highlighted). */
export const phrasesIn = (texts: readonly string[], phrases: readonly VaguePhrase[]): readonly VaguePhrase[] =>
  phrases.filter((phrase) => texts.some((text) => matchesOf(text, phrase).length > 0))
