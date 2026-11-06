import { useChat } from '@ai-sdk/vue'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai'
import type { LinkedinBridge, LinkedinToolInput } from './useLinkedinBridge'
import { getAgentStatus } from '@/lib/agent-api'
import { isAgentNotConfigured } from '@/lib/assistant-parts'
import { toWirePage, type PageContext } from '@/lib/page-context'
import { AGENT_CHAT_PATH } from '@/lib/api-paths'

/** Tools the browser runs (LinkedIn, through the extension). Not awaited: the SDK waits for the output, awaiting would deadlock. */
const runInBrowser = (linkedin: LinkedinBridge | null, toolCall: { toolName: string; input: unknown }, done: (output: unknown) => void): void => {
  if (toolCall.toolName !== 'search_linkedin_people' || !linkedin) return
  void linkedin.run(toolCall.input as LinkedinToolInput).then(done)
}

const BUSY: ReadonlySet<string> = new Set(['submitted', 'streaming'])

/**
 * One conversation with the internal agent over the AI SDK UI message stream (`POST /api/v1/agent/chat`, same
 * origin, session cookie). Every request carries the messages of the open panel and the page in sight; the api
 * keeps nothing, so the conversation lives only here and a reload starts empty. Nothing is kept in browser storage:
 * "Nuova conversazione" just clears the list.
 */
export const useAssistantChat = (page: () => PageContext, linkedin: LinkedinBridge | null = null) => {
  const request = useJobsApi()
  /** null = not known yet (or an api without the status route): the chat itself will say. Shared with the settings. */
  const configured = useAssistantConfigured()

  const transport = new DefaultChatTransport<UIMessage>({
    api: AGENT_CHAT_PATH,
    credentials: 'same-origin',
    body: () => ({ page: toWirePage(page()) }),
  })
  const chat = useChat<UIMessage>({
    id: 'assistant',
    transport,
    // A tool the browser ran (LinkedIn, through the extension) sends the conversation back once it has its result.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => runInBrowser(linkedin, toolCall, (output) => chat.addToolOutput({ tool: 'search_linkedin_people', toolCallId: toolCall.toolCallId, output })),
    onError: (error) => {
      if (isAgentNotConfigured(error)) configured.value = false
      else console.error('[assistant] turn failed', error.message.slice(0, 200))
    },
  })

  const checkStatus = async (): Promise<void> => {
    if (configured.value !== null) return
    try {
      configured.value = (await getAgentStatus(request)).enabled
    } catch {
      // No status route (yet) or a transient failure: let the first message find out.
    }
  }

  const busy = computed(() => BUSY.has(chat.status.value))

  /** Sends a trimmed message; false when empty, while a turn is in flight, or when the agent is off. */
  const send = (text: string): boolean => {
    const trimmed = text.trim()
    if (trimmed === '' || busy.value || configured.value === false) return false
    void chat.sendMessage({ text: trimmed })
    return true
  }

  const reset = async (): Promise<void> => {
    await chat.stop()
    chat.messages.value = []
    chat.clearError()
  }

  return {
    /** A fresh array on every change: the SDK mutates its list in place and only triggers the ref. */
    messages: computed(() => [...chat.messages.value]),
    status: chat.status,
    error: computed(() => (chat.error.value && !isAgentNotConfigured(chat.error.value) ? chat.error.value : null)),
    configured: computed(() => configured.value),
    busy,
    send,
    stop: () => chat.stop(),
    retry: () => chat.regenerate(),
    reset,
    checkStatus,
  }
}
