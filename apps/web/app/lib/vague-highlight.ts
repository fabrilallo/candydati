import type { VaguePhrase } from '@tt/domain'

/** Anything highlighted by its literal text: a vague phrase, a compliance finding. */
interface Phrase {
  readonly text: string
}

export interface TextPart<P extends Phrase = VaguePhrase> {
  readonly text: string
  /** The phrase this part matches, `null` for plain text. */
  readonly phrase: P | null
}

interface Match<P extends Phrase> {
  readonly start: number
  readonly end: number
  readonly phrase: P
}

const matchesOf = <P extends Phrase>(text: string, phrase: P): readonly Match<P>[] => {
  const needle = phrase.text.trim().toLocaleLowerCase()
  if (needle === '') return []
  const haystack = text.toLocaleLowerCase()
  const found: Match<P>[] = []
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    found.push({ start: at, end: at + needle.length, phrase })
  }
  return found
}

/** Longest first, then leftmost: a longer phrase wins over the shorter ones it contains. */
const byPriority = <P extends Phrase>(a: Match<P>, b: Match<P>): number => b.end - b.start - (a.end - a.start) || a.start - b.start

const nonOverlapping = <P extends Phrase>(matches: readonly Match<P>[]): readonly Match<P>[] =>
  [...matches]
    .sort(byPriority)
    .reduce<Match<P>[]>((kept, match) => (kept.some((other) => match.start < other.end && other.start < match.end) ? kept : [...kept, match]), [])
    .sort((a, b) => a.start - b.start)

/**
 * Pure: splits `text` into plain parts and parts that match a vague phrase found by the last analysis.
 * Case-insensitive, literal (no regex), never nested; the original spelling is kept.
 */
export const splitHighlights = <P extends Phrase = VaguePhrase>(text: string, phrases: readonly P[]): readonly TextPart<P>[] => {
  if (text === '') return []
  const matches = nonOverlapping(phrases.flatMap((phrase) => matchesOf(text, phrase)))
  const parts: TextPart<P>[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) parts.push({ text: text.slice(cursor, match.start), phrase: null })
    parts.push({ text: text.slice(match.start, match.end), phrase: match.phrase })
    cursor = match.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), phrase: null })
  return parts
}
