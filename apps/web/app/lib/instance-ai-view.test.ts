import { describe, expect, it } from 'vitest'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import {
  emptyInstanceAiForm,
  formFromAiSettings,
  instanceAiInput,
  keyIsStored,
  providersInUse,
  turnsAiOff,
  withAiKey,
  withModelName,
  withModelSlot,
  withSlotProvider,
} from './instance-ai-view'

describe('instance ai view', () => {
  it('starts with both models off, on the recommended providers, with no key', () => {
    expect(formFromAiSettings(instanceAi())).toEqual(emptyInstanceAiForm)
    expect(emptyInstanceAiForm).toEqual({ assistant: { on: false, provider: 'openai', model: '' }, fast: { on: false, provider: 'google', model: '' }, keys: {} })
    expect(turnsAiOff(emptyInstanceAiForm)).toBe(true)
    expect(providersInUse(emptyInstanceAiForm)).toEqual([])
  })

  it('fills the form from the stored settings, never a key', () => {
    expect(formFromAiSettings(aiReady())).toEqual({
      assistant: { on: true, provider: 'anthropic', model: 'claude-sonnet-5-5' },
      fast: { on: true, provider: 'google', model: 'gemini-3.1-flash-lite' },
      keys: {},
    })
    expect(formFromAiSettings(aiReady({ fast: null })).fast).toEqual({ on: false, provider: 'google', model: '' })
    expect(formFromAiSettings(aiReady({ assistant: { provider: 'ollama', model: 'x' } })).assistant).toEqual({ on: true, provider: 'openai', model: 'x' })
  })

  it('proposes the recommended model when a model is switched on, and keeps a typed name when off', () => {
    const on = withModelSlot(withModelSlot(emptyInstanceAiForm, 'assistant', true), 'fast', true)
    expect(on.assistant).toEqual({ on: true, provider: 'openai', model: 'gpt-6-luna' })
    expect(on.fast).toEqual({ on: true, provider: 'google', model: 'gemini-3.1-flash-lite' })
    const typed = withModelName(on, 'fast', 'my-model')
    expect(withModelSlot(withModelSlot(typed, 'fast', false), 'fast', true).fast.model).toBe('my-model')
    expect(emptyInstanceAiForm.assistant.on).toBe(false)
  })

  it('suggests the models of a new provider for one slot only, keeping typed keys', () => {
    const form = withAiKey(formFromAiSettings(aiReady()), 'anthropic', 'typed')
    const next = withSlotProvider(form, 'fast', 'mistral')
    expect(next.fast).toEqual({ on: true, provider: 'mistral', model: 'mistral-small-latest' })
    expect(next.assistant).toBe(form.assistant)
    expect(next.keys).toEqual({ anthropic: 'typed' })
    expect(withSlotProvider(form, 'assistant', 'openrouter').assistant.model).toBe('')
    expect(withSlotProvider(form, 'fast', 'google')).toBe(form)
    expect(form.fast.provider).toBe('google')
  })

  it('lists each provider in use once, only for the models switched on', () => {
    const form = formFromAiSettings(aiReady())
    expect(providersInUse(form)).toEqual(['anthropic', 'google'])
    expect(providersInUse(withSlotProvider(form, 'fast', 'anthropic'))).toEqual(['anthropic'])
    expect(providersInUse(withModelSlot(form, 'assistant', false))).toEqual(['google'])
  })

  it('knows which providers have a key stored', () => {
    expect(keyIsStored('google', aiReady())).toBe(true)
    expect(keyIsStored('openai', aiReady())).toBe(false)
  })

  it('builds the input: switched-off models are null, empty keys keep the stored ones, unused keys are not sent', () => {
    const settings = aiReady()
    const form = withModelSlot(formFromAiSettings(settings), 'fast', false)
    expect(instanceAiInput(form, settings)).toEqual({ ok: true, input: { assistant: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, fast: null, keys: {} } })
    const typed = withAiKey(withAiKey(form, 'anthropic', ' new-key '), 'google', 'unused')
    expect(instanceAiInput(typed, settings)).toEqual({ ok: true, input: { assistant: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, fast: null, keys: { anthropic: 'new-key' } } })
  })

  it('asks for the key of each provider in use without one, and for model names', () => {
    const settings = instanceAi({ storedKeys: ['google'] })
    const form = withModelName(withModelSlot(withModelSlot(emptyInstanceAiForm, 'assistant', true), 'fast', true), 'assistant', ' ')
    expect(instanceAiInput(form, settings)).toEqual({ ok: false, errors: { 'keys.openai': 'instanceAi.errors.apiKeyMissing', assistant: 'instanceAi.errors.modelMissing' } })
    const keyed = withAiKey(form, 'openai', 'k')
    expect(instanceAiInput(withModelName(keyed, 'assistant', 'openai/gpt 5'), settings)).toEqual({ ok: false, errors: { assistant: 'instanceAi.errors.model' } })
    expect(instanceAiInput(withAiKey(withModelName(keyed, 'assistant', 'gpt-5'), 'openai', 'k'.repeat(600)), settings)).toEqual({ ok: false, errors: { 'keys.openai': 'instanceAi.errors.apiKey' } })
  })

  it('turns AI off without a key', () => {
    expect(instanceAiInput(emptyInstanceAiForm, instanceAi())).toEqual({ ok: true, input: { assistant: null, fast: null, keys: {} } })
  })
})
