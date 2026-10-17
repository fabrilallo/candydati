import { instanceAiSettingsInputSchema, type AiProvider, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain'
import { RECOMMENDED_MODELS, isAiProvider, modelSuggestions, type AiModelSlot } from './ai-models'

/** One model as the form holds it: the name as typed, kept while switched off. */
export interface InstanceAiModelDraft {
  readonly on: boolean
  readonly provider: AiProvider
  readonly model: string
}

/** What the form holds: each model with its own provider, and the keys typed (empty unless a new one is typed). */
export interface InstanceAiForm {
  readonly assistant: InstanceAiModelDraft
  readonly fast: InstanceAiModelDraft
  readonly keys: Readonly<Partial<Record<AiProvider, string>>>
}

/** A model name field (`assistant`, `fast`) or the key field of a provider (`keys.openai`), as the server names them. */
export type InstanceAiField = AiModelSlot | `keys.${AiProvider}`
export type InstanceAiErrors = Partial<Record<InstanceAiField, string>>
export type InstanceAiInputResult = { readonly ok: true; readonly input: InstanceAiSettingsInput } | { readonly ok: false; readonly errors: InstanceAiErrors }

const SLOTS: readonly AiModelSlot[] = ['assistant', 'fast']

const offDraft = (slot: AiModelSlot): InstanceAiModelDraft => ({ on: false, provider: RECOMMENDED_MODELS[slot].provider, model: '' })

export const emptyInstanceAiForm: InstanceAiForm = { assistant: offDraft('assistant'), fast: offDraft('fast'), keys: {} }

const draftFrom = (slot: AiModelSlot, chosen: InstanceAiSettingsDto['assistant']): InstanceAiModelDraft => {
  if (!chosen) return offDraft(slot)
  return { on: true, provider: isAiProvider(chosen.provider) ? chosen.provider : RECOMMENDED_MODELS[slot].provider, model: chosen.model }
}

/** Pure: the form for the stored settings. Keys never reach the browser, so none is filled. */
export const formFromAiSettings = (settings: InstanceAiSettingsDto): InstanceAiForm => ({
  assistant: draftFrom('assistant', settings.assistant),
  fast: draftFrom('fast', settings.fast),
  keys: {},
})

/** Pure: a key is stored for the provider, so leaving its field empty keeps it. */
export const keyIsStored = (provider: AiProvider, settings: InstanceAiSettingsDto): boolean => settings.storedKeys.includes(provider)

/** Pure: the providers of the models switched on, each once (one key field per provider). */
export const providersInUse = (form: InstanceAiForm): readonly AiProvider[] =>
  SLOTS.filter((slot) => form[slot].on).map((slot) => form[slot].provider).filter((provider, index, all) => all.indexOf(provider) === index)

const withDraft = (form: InstanceAiForm, slot: AiModelSlot, draft: InstanceAiModelDraft): InstanceAiForm => ({ ...form, [slot]: draft })

/** Pure: another provider for one model. Its names differ, so the model starts from that provider's first suggestion. */
export const withSlotProvider = (form: InstanceAiForm, slot: AiModelSlot, provider: AiProvider): InstanceAiForm => {
  if (provider === form[slot].provider) return form
  return withDraft(form, slot, { ...form[slot], provider, model: modelSuggestions(provider, slot)[0] ?? '' })
}

/** Pure: a model switched on (an empty name gets the first suggestion of its provider) or off (the name stays). */
export const withModelSlot = (form: InstanceAiForm, slot: AiModelSlot, on: boolean): InstanceAiForm => {
  const draft = form[slot]
  const model = on && draft.model.trim() === '' ? (modelSuggestions(draft.provider, slot)[0] ?? '') : draft.model
  return withDraft(form, slot, { ...draft, on, model })
}

export const withModelName = (form: InstanceAiForm, slot: AiModelSlot, model: string): InstanceAiForm => withDraft(form, slot, { ...form[slot], model })

export const withAiKey = (form: InstanceAiForm, provider: AiProvider, key: string): InstanceAiForm => ({ ...form, keys: { ...form.keys, [provider]: key } })

/** Pure: both models off. Saving then turns AI off, with no test call. */
export const turnsAiOff = (form: InstanceAiForm): boolean => !form.assistant.on && !form.fast.on

const typedKey = (form: InstanceAiForm, provider: AiProvider): string => (form.keys[provider] ?? '').trim()

const missing = (form: InstanceAiForm, settings: InstanceAiSettingsDto): InstanceAiErrors => ({
  ...Object.fromEntries(
    providersInUse(form)
      .filter((provider) => typedKey(form, provider) === '' && !keyIsStored(provider, settings))
      .map((provider) => [`keys.${provider}`, 'instanceAi.errors.apiKeyMissing']),
  ),
  ...Object.fromEntries(SLOTS.filter((slot) => form[slot].on && form[slot].model.trim() === '').map((slot) => [slot, 'instanceAi.errors.modelMissing'])),
})

const draftOf = (form: InstanceAiForm): unknown => ({
  assistant: form.assistant.on ? { provider: form.assistant.provider, model: form.assistant.model } : null,
  fast: form.fast.on ? { provider: form.fast.provider, model: form.fast.model } : null,
  keys: Object.fromEntries(providersInUse(form).filter((provider) => typedKey(form, provider) !== '').map((provider) => [provider, form.keys[provider]])),
})

const fieldOf = (path: readonly PropertyKey[]): readonly [InstanceAiField, string] | null => {
  const [head, next] = path.map(String)
  if (head === 'keys' && next && isAiProvider(next)) return [`keys.${next}`, 'instanceAi.errors.apiKey']
  if (head === 'assistant' || head === 'fast') return [head, 'instanceAi.errors.model']
  return null
}

/** Pure: the input for the api, validated with the same schema; or the message of each invalid field. */
export const instanceAiInput = (form: InstanceAiForm, settings: InstanceAiSettingsDto): InstanceAiInputResult => {
  const empty = missing(form, settings)
  if (Object.keys(empty).length > 0) return { ok: false, errors: empty }
  const parsed = instanceAiSettingsInputSchema.safeParse(draftOf(form))
  if (parsed.success) return { ok: true, input: parsed.data }
  const errors = parsed.error.issues.reduce<InstanceAiErrors>((acc, issue) => {
    const found = fieldOf(issue.path)
    return found && !(found[0] in acc) ? { ...acc, [found[0]]: found[1] } : acc
  }, {})
  return { ok: false, errors }
}
