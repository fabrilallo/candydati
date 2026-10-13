import { AGENT_NOT_CONFIGURED_CODES, draftJobOutputSchema, draftMessageOutputSchema, isAgentTool, type DraftJobOutput, type DraftMessageOutput } from './phase6-contract'

/**
 * From the parts of an AI SDK UI message to what the assistant panel shows: text, compact tool steps ("Ho letto
 * l'annuncio"), and the two draft cards. Tool outputs are validated here; one that does not match is a failed step,
 * never a card. Pure.
 */
export interface PartLike {
  readonly type: string
  readonly [key: string]: unknown
}
export interface MessageLike {
  readonly role: string
  readonly parts: readonly PartLike[]
}

export type StepState = 'running' | 'done' | 'failed'
export interface Step {
  readonly id: string
  readonly tool: string
  readonly state: StepState
}

export type AssistantItem =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'steps'; readonly steps: readonly Step[] }
  | { readonly kind: 'draft_message'; readonly id: string; readonly draft: DraftMessageOutput }
  | { readonly kind: 'draft_job'; readonly id: string; readonly draft: DraftJobOutput }

interface ToolCall {
  readonly id: string
  readonly tool: string
  readonly state: string
  readonly output: unknown
}

const toolCallOf = (part: PartLike): ToolCall | null => {
  const name = part.type === 'dynamic-tool' ? part.toolName : part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : null
  if (typeof name !== 'string') return null
  return { id: typeof part.toolCallId === 'string' ? part.toolCallId : name, tool: name, state: String(part.state ?? ''), output: part.output }
}

const stateOf = (state: string): StepState => (state === 'output-available' ? 'done' : state === 'output-error' || state === 'output-denied' ? 'failed' : 'running')

type Card = Extract<AssistantItem, { kind: 'draft_message' | 'draft_job' }>

/** The draft card of a finished call, `null` when the tool has no card, `'invalid'` when its output does not validate. */
const cardOf = (call: ToolCall): Card | null | 'invalid' => {
  if (call.state !== 'output-available') return null
  if (call.tool === 'draft_message') {
    const parsed = draftMessageOutputSchema.safeParse(call.output)
    return parsed.success ? { kind: 'draft_message', id: call.id, draft: parsed.data } : 'invalid'
  }
  if (call.tool === 'draft_job_content') {
    const parsed = draftJobOutputSchema.safeParse(call.output)
    return parsed.success ? { kind: 'draft_job', id: call.id, draft: parsed.data } : 'invalid'
  }
  return null
}

const withStep = (items: readonly AssistantItem[], step: Step): readonly AssistantItem[] => {
  const last = items.at(-1)
  return last?.kind === 'steps' ? [...items.slice(0, -1), { kind: 'steps', steps: [...last.steps, step] }] : [...items, { kind: 'steps', steps: [step] }]
}

const textOf = (part: PartLike): string | null => (part.type === 'text' && typeof part.text === 'string' ? part.text.trim() : null)

interface Acc {
  readonly items: readonly AssistantItem[]
  /** Cards wait until the run of steps ends, so the steps stay one compact list and the drafts stand out after it. */
  readonly cards: readonly Card[]
}

const addText = (acc: Acc, text: string): Acc => {
  const repeated = acc.items.some((item) => item.kind === 'text' && item.text === text)
  if (text === '' || repeated) return acc
  return { items: [...acc.items, ...acc.cards, { kind: 'text', text }], cards: [] }
}

const addCall = (acc: Acc, call: ToolCall): Acc => {
  const card = cardOf(call)
  const state = card === 'invalid' ? 'failed' : stateOf(call.state)
  return { items: withStep(acc.items, { id: call.id, tool: call.tool, state }), cards: card && card !== 'invalid' ? [...acc.cards, card] : acc.cards }
}

/** Items in reading order. Unknown parts (reasoning, files, step markers) are left out. */
export const assistantItems = (message: MessageLike): readonly AssistantItem[] => {
  const acc = message.parts.reduce<Acc>(
    (current, part) => {
      const text = textOf(part)
      if (text !== null) return addText(current, text)
      const call = toolCallOf(part)
      return call ? addCall(current, call) : current
    },
    { items: [], cards: [] },
  )
  return [...acc.items, ...acc.cards]
}

export const stepLabelKey = (step: Step): string => {
  if (step.state === 'failed') return 'assistant.steps.failed'
  return `assistant.steps.${isAgentTool(step.tool) ? step.tool : 'generic'}.${step.state}`
}

const codeIn = (text: string): string | null => {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown } } | null
    return typeof parsed?.error?.code === 'string' ? parsed.error.code : null
  } catch {
    return null
  }
}

/** The chat transport throws the response text as the message: the api's envelope, or a bare code. */
export const isAgentNotConfigured = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const code = codeIn(error.message) ?? error.message.trim()
  return AGENT_NOT_CONFIGURED_CODES.includes(code)
}
