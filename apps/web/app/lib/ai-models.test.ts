import { AI_PROVIDERS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { AI_PROVIDER_LABELS, apiKeyUrl, modelSuggestions } from './ai-models'

describe('ai models', () => {
  it('has a human name and an https page for the key of every provider', () => {
    for (const provider of AI_PROVIDERS) {
      expect(AI_PROVIDER_LABELS[provider]).toBeTruthy()
      expect(apiKeyUrl(provider)).toMatch(/^https:\/\//)
    }
    expect(AI_PROVIDER_LABELS.openai).toBe('OpenAI')
    expect(AI_PROVIDER_LABELS.xai).toBe('xAI')
  })

  it('suggests a capable model for the assistant and a small one for the fast tasks', () => {
    expect(modelSuggestions('anthropic', 'assistant')[0]).toBe('claude-sonnet-5-5')
    expect(modelSuggestions('anthropic', 'fast')[0]).toBe('claude-haiku-5-5')
    expect(modelSuggestions('mistral', 'assistant')[0]).toBe('mistral-large-latest')
    expect(modelSuggestions('mistral', 'fast')[0]).toBe('mistral-small-latest')
    expect(modelSuggestions('google', 'fast').length).toBeGreaterThan(0)
    expect(modelSuggestions('openai', 'assistant').length).toBeGreaterThan(0)
  })

  it('leaves the field free where it suggests nothing', () => {
    expect(modelSuggestions('openrouter', 'assistant')).toEqual([])
    expect(modelSuggestions('groq', 'fast')).toEqual([])
  })
})
