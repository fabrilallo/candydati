/**
 * A message another screen wants the assistant to start from (a hiring request to turn into an ad). The panel takes
 * it into its composer once, so the person reads it and sends it; nothing is sent on their behalf.
 */
export const useAssistantPrefill = () => {
  const text = useState<string | null>('assistant-prefill', () => null)
  return {
    pending: computed(() => text.value),
    set: (message: string): void => {
      text.value = message
    },
    /** The panel takes the message once; the next call returns null. */
    take: (): string | null => {
      const taken = text.value
      text.value = null
      return taken
    },
  }
}
