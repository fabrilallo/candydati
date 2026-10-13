/**
 * Minimal, dependency-free markdown for the assistant's replies: headings, paragraphs, bullet and numbered lists,
 * bold, italic and inline code. Anything else stays text. No HTML and no links are ever interpreted: the result is
 * rendered with text interpolation only (`RichText`).
 */
export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }

export type Block =
  | { readonly kind: 'heading'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] }

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g

const inlineOf = (part: string): Inline => {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { kind: 'bold', text: part.slice(2, -2) }
  if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { kind: 'code', text: part.slice(1, -1) }
  if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return { kind: 'italic', text: part.slice(1, -1) }
  return { kind: 'text', text: part }
}

export const parseInline = (text: string): readonly Inline[] =>
  text
    .split(INLINE)
    .filter((part) => part.length > 0)
    .map(inlineOf)

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
