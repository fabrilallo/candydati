import { getAgentStatus } from '@/lib/agent-api'

/** Whether the internal assistant is configured on this installation, asked on demand. */
export const useAssistantEnabled = (request: ReturnType<typeof useJobsApi>) => {
  const assistantEnabled = ref(false)
  const checkAssistant = async (): Promise<void> => {
    try {
      assistantEnabled.value = (await getAgentStatus(request)).enabled
    } catch {
      assistantEnabled.value = false
    }
  }
  return { assistantEnabled, checkAssistant }
}
