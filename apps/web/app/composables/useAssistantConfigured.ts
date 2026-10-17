/**
 * Whether the assistant has a model, shared by the panel and the AI settings: `null` until known. A save in the
 * settings sets it, so an open panel learns the new state without a reload.
 */
export const useAssistantConfigured = () => useState<boolean | null>('assistant-configured', () => null)
