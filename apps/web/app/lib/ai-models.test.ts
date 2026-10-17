import { AI_PROVIDERS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { AI_PROVIDER_LABELS, RECOMMENDED_MODELS, apiKeyUrl, isAiProvider, modelSuggestions, providerLabel } from './ai-models'

describe('ai models', () => {
  it('has a human name and an https page for the key of every provider', () => {
    for (const provider of AI_PROVIDERS) {
      expect(AI_PROVIDER_LABELS[provider]).toBeTruthy()
      expect(apiKeyUrl(provider)).toMatch(/^https:\/\//)
    }
    expect(AI_PROVIDER_LABELS.openai).toBe('OpenAI')
    expect(AI_PROVIDER_LABELS.xai).toBe('xAI')
  })

  it('recommends a model per slot, first in the suggestions of its provider', () => {
    expect(RECOMMENDED_MODELS.assistant).toEqual({ provider: 'openai', model: 'gpt-6-luna' })
    expect(RECOMMENDED_MODELS.fast).toEqual({ provider: 'google', model: 'gemini-3.1-flash-lite' })
    expect(modelSuggestions('openai', 'assistant')).toEqual(['gpt-6-luna', 'gpt-5', 'gpt-5-mini'])
    expect(modelSuggestions('google', 'fast')).toEqual(['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])
  })

  it('suggests a capable model for the assistant and a small one for the fast tasks', () => {
    expect(modelSuggestions('anthropic', 'assistant')[0]).toBe('claude-sonnet-5-5')
    expect(modelSuggestions('anthropic', 'fast')[0]).toBe('claude-haiku-5-5')
    expect(modelSuggestions('mistral', 'assistant')[0]).toBe('mistral-large-latest')
    expect(modelSuggestions('mistral', 'fast')[0]).toBe('mistral-small-latest')
    expect(modelSuggestions('openai', 'fast')[0]).toBe('gpt-5-mini')
  })

  it('leaves the field free where it suggests nothing', () => {
    expect(modelSuggestions('openrouter', 'assistant')).toEqual([])
    expect(modelSuggestions('groq', 'fast')).toEqual([])
  })

  it('knows the providers and names an unknown one as written', () => {
    expect(isAiProvider('google')).toBe(true)
    expect(isAiProvider('ollama')).toBe(false)
    expect(providerLabel('deepseek')).toBe('DeepSeek')
    expect(providerLabel('ollama')).toBe('ollama')
  })
})
