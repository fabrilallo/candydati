import { describe, expect, it } from 'vitest'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import { emptyInstanceAiForm, formFromAiSettings, instanceAiInput, keyIsStored, turnsAiOff, withAiProvider, withModelSlot } from './instance-ai-view'

describe('instance ai view', () => {
  it('starts with both models off and no key on a fresh instance', () => {
    expect(formFromAiSettings(instanceAi())).toEqual(emptyInstanceAiForm)
    expect(turnsAiOff(emptyInstanceAiForm)).toBe(true)
  })

  it('fills the form from the stored settings, never the key', () => {
    expect(formFromAiSettings(aiReady())).toEqual({ provider: 'anthropic', apiKey: '', assistantOn: true, assistantModel: 'claude-sonnet-5-5', fastOn: true, fastModel: 'claude-haiku-5-5' })
    expect(formFromAiSettings(aiReady({ fastModel: null })).fastOn).toBe(false)
  })

  it('keeps the stored key only for the provider it belongs to', () => {
    const settings = aiReady()
    const form = formFromAiSettings(settings)
    expect(keyIsStored(form, settings)).toBe(true)
    expect(keyIsStored(withAiProvider(form, 'openai'), settings)).toBe(false)
    expect(keyIsStored(form, aiReady({ hasApiKey: false }))).toBe(false)
  })

  it('suggests the models of a new provider and forgets the key typed for the old one', () => {
    const form = { ...formFromAiSettings(aiReady()), apiKey: 'typed' }
    const next = withAiProvider(form, 'mistral')
    expect(next).toMatchObject({ provider: 'mistral', apiKey: '', assistantModel: 'mistral-large-latest', fastModel: 'mistral-small-latest' })
    expect(withAiProvider(form, 'openrouter')).toMatchObject({ assistantModel: '', fastModel: '' })
    expect(form.provider).toBe('anthropic')
    expect(withAiProvider(form, 'anthropic')).toBe(form)
  })

  it('switches a model on with a suggestion and off keeping what was typed', () => {
    const on = withModelSlot({ ...emptyInstanceAiForm, provider: 'anthropic' }, 'fast', true)
    expect(on).toMatchObject({ fastOn: true, fastModel: 'claude-haiku-5-5' })
    const typed = { ...on, fastModel: 'my-model' }
    expect(withModelSlot(withModelSlot(typed, 'fast', false), 'fast', true).fastModel).toBe('my-model')
    expect(withModelSlot({ ...emptyInstanceAiForm, provider: 'groq' }, 'assistant', true)).toMatchObject({ assistantOn: true, assistantModel: '' })
  })

  it('builds the input: switched-off models are null and an empty key keeps the stored one', () => {
    const settings = aiReady()
    const form = { ...formFromAiSettings(settings), fastOn: false }
    expect(instanceAiInput(form, settings)).toEqual({ ok: true, input: { provider: 'anthropic', assistantModel: 'claude-sonnet-5-5', fastModel: null } })
    expect(instanceAiInput({ ...form, apiKey: ' new-key ' }, settings)).toEqual({ ok: true, input: { provider: 'anthropic', apiKey: 'new-key', assistantModel: 'claude-sonnet-5-5', fastModel: null } })
  })

  it('asks for a key and a model name when a model is on', () => {
    const settings = instanceAi()
    const form = withModelSlot({ ...emptyInstanceAiForm, provider: 'groq' }, 'assistant', true)
    expect(instanceAiInput(form, settings)).toEqual({ ok: false, errors: { apiKey: 'instanceAi.errors.apiKeyMissing', assistantModel: 'instanceAi.errors.modelMissing' } })
    expect(instanceAiInput({ ...form, apiKey: 'k', assistantModel: 'groq/llama 3' }, settings)).toEqual({ ok: false, errors: { assistantModel: 'instanceAi.errors.model' } })
    expect(instanceAiInput({ ...form, apiKey: 'k'.repeat(600), assistantModel: 'llama-3.3-70b' }, settings)).toEqual({ ok: false, errors: { apiKey: 'instanceAi.errors.apiKey' } })
  })

  it('turns AI off without a key', () => {
    expect(instanceAiInput(emptyInstanceAiForm, instanceAi())).toEqual({ ok: true, input: { provider: 'openai', assistantModel: null, fastModel: null } })
  })
})
