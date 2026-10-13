import { useChat } from '@ai-sdk/vue'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { callApi } from '@/lib/api-call'
import { isAgentNotConfigured } from '@/lib/assistant-parts'
import { toWirePage, type PageContext } from '@/lib/page-context'
import { AGENT_CHAT_PATH, AGENT_STATUS_PATH, agentStatusSchema } from '@/lib/phase6-contract'

const BUSY: ReadonlySet<string> = new Set(['submitted', 'streaming'])

/**
 * One conversation with the internal agent over the AI SDK UI message stream (`POST /api/v1/agent/chat`, same
 * origin, session cookie). Every request carries the messages of the open panel and the page in sight; the api
 * keeps nothing, so the conversation lives only here and a reload starts empty. Nothing is kept in browser storage:
 * "Nuova conversazione" just clears the list.
 */
export const useAssistantChat = (page: () => PageContext) => {
  const request = useJobsApi()
  /** null = not known yet (or an api without the status route): the chat itself will say. */
  const configured = ref<boolean | null>(null)

  const transport = new DefaultChatTransport<UIMessage>({
    api: AGENT_CHAT_PATH,
    credentials: 'same-origin',
    body: () => ({ page: toWirePage(page()) }),
  })
  const chat = useChat<UIMessage>({
    id: 'assistant',
    transport,
    onError: (error) => {
      if (isAgentNotConfigured(error)) configured.value = false
      else console.error('[assistant] turn failed', error.message.slice(0, 200))
    },
  })

  const checkStatus = async (): Promise<void> => {
    if (configured.value !== null) return
    try {
      configured.value = (await callApi(request, AGENT_STATUS_PATH, agentStatusSchema)).data.enabled
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
