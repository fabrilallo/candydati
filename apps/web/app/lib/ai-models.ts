import type { AiProvider } from '@candydati/domain'

/** Which model a setting is for: the assistant in the side panel, or the short frequent tasks. */
export type AiModelSlot = 'assistant' | 'fast'

/** Provider names as people know them (brand names, the same in every language). */
export const AI_PROVIDER_LABELS: Readonly<Record<AiProvider, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  openrouter: 'OpenRouter',
}

/** Where to create an API key for each provider. */
const API_KEY_URLS: Readonly<Record<AiProvider, string>> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/app/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  groq: 'https://console.groq.com/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  xai: 'https://console.x.ai',
  openrouter: 'https://openrouter.ai/keys',
}

/**
 * A few current model names per provider, first the one we suggest. Only hints for the field: any name the provider
 * accepts can be typed, and the save tests it. Providers with fast-changing catalogues get a free field.
 */
const SUGGESTIONS: Readonly<Partial<Record<AiProvider, Readonly<Record<AiModelSlot, readonly string[]>>>>> = {
  anthropic: { assistant: ['claude-sonnet-5-5', 'claude-opus-5-5'], fast: ['claude-haiku-5-5'] },
  openai: { assistant: ['gpt-5', 'gpt-5-mini'], fast: ['gpt-5-mini', 'gpt-5-nano'] },
  google: { assistant: ['gemini-2.5-pro', 'gemini-2.5-flash'], fast: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  mistral: { assistant: ['mistral-large-latest', 'mistral-medium-latest'], fast: ['mistral-small-latest'] },
}

export const apiKeyUrl = (provider: AiProvider): string => API_KEY_URLS[provider]

/** Pure: the model names to suggest for a provider and a slot (empty when the field is left free). */
export const modelSuggestions = (provider: AiProvider, slot: AiModelSlot): readonly string[] => SUGGESTIONS[provider]?.[slot] ?? []
