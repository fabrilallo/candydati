/**
 * Minimal, dependency-free markdown for the assistant's replies: headings, paragraphs, bullet and numbered lists,
 * bold, italic, inline code and links to a page of the app. Anything else stays text. No HTML and no outside links are
 * ever interpreted: the result is rendered with text interpolation only (`RichText`).
 */
export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }

export type Block =
  | { readonly kind: 'heading'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] }

const INLINE = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g
const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/
/** Same-origin pages of the app only: no scheme, no host, no dot segments, no query that could carry a redirect. */
const APP_PATH = /^\/app(?:\/[\w-]+)*$/

const inlineOf = (part: string): Inline => {
  const link = LINK.exec(part)
  if (link?.[1] && link[2]) return APP_PATH.test(link[2]) ? { kind: 'link', text: link[1], href: link[2] } : { kind: 'text', text: part }
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { kind: 'bold', text: part.slice(2, -2) }
  if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { kind: 'code', text: part.slice(1, -1) }
  if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return { kind: 'italic', text: part.slice(1, -1) }
  return { kind: 'text', text: part }
}

/** A refused link becomes text: it joins the text around it, as if it had never been matched. */
const joinText = (inlines: readonly Inline[], next: Inline): readonly Inline[] => {
  const last = inlines.at(-1)
  if (last?.kind === 'text' && next.kind === 'text') return [...inlines.slice(0, -1), { kind: 'text', text: last.text + next.text }]
  return [...inlines, next]
}

export const parseInline = (text: string): readonly Inline[] =>
  text
    .split(INLINE)
    .filter((part) => part.length > 0)
    .map(inlineOf)
    .reduce<readonly Inline[]>(joinText, [])

const HEADING = /^\s*#{1,6}\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

interface State {
  readonly blocks: readonly Block[]
  readonly paragraph: readonly string[]
  readonly list: { readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] } | null
}

const closeParagraph = (state: State): State =>
  state.paragraph.length === 0 ? state : { ...state, blocks: [...state.blocks, { kind: 'paragraph', inlines: parseInline(state.paragraph.join('\n')) }], paragraph: [] }

const closeList = (state: State): State => (state.list ? { ...state, blocks: [...state.blocks, { kind: 'list', ...state.list }], list: null } : state)

const close = (state: State): State => closeList(closeParagraph(state))

const addListItem = (state: State, ordered: boolean, text: string): State => {
  const open = closeParagraph(state)
  const item = parseInline(text)
  if (open.list?.ordered === ordered) return { ...open, list: { ordered, items: [...open.list.items, item] } }
  return { ...closeList(open), list: { ordered, items: [item] } }
}

const step = (state: State, line: string): State => {
  const heading = HEADING.exec(line)
  if (heading) {
    const closed = close(state)
    return { ...closed, blocks: [...closed.blocks, { kind: 'heading', inlines: parseInline(heading[1] ?? '') }] }
  }
  const bullet = BULLET.exec(line)
  if (bullet) return addListItem(state, false, bullet[1] ?? '')
  const numbered = NUMBERED.exec(line)
  if (numbered) return addListItem(state, true, numbered[1] ?? '')
  if (line.trim() === '') return close(state)
  return { ...closeList(state), paragraph: [...state.paragraph, line] }
}

/** Blocks in order. Consecutive list lines of the same kind form one list; blank lines separate paragraphs. */
export const parseMarkdownLite = (text: string): readonly Block[] =>
  close(text.replace(/\r\n/g, '\n').split('\n').reduce<State>(step, { blocks: [], paragraph: [], list: null })).blocks
