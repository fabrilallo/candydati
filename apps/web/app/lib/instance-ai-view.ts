import { AI_PROVIDERS, instanceAiSettingsInputSchema, type AiProvider, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain'
import { modelSuggestions, type AiModelSlot } from './ai-models'

/** What the form holds: model names as typed (kept while switched off), the key empty unless a new one is typed. */
export interface InstanceAiForm {
  readonly provider: AiProvider
  readonly apiKey: string
  readonly assistantOn: boolean
  readonly assistantModel: string
  readonly fastOn: boolean
  readonly fastModel: string
}

export type InstanceAiField = 'apiKey' | 'assistantModel' | 'fastModel'
export type InstanceAiErrors = Partial<Record<InstanceAiField, string>>
export type InstanceAiInputResult = { readonly ok: true; readonly input: InstanceAiSettingsInput } | { readonly ok: false; readonly errors: InstanceAiErrors }

const DEFAULT_PROVIDER: AiProvider = AI_PROVIDERS[0]

export const emptyInstanceAiForm: InstanceAiForm = { provider: DEFAULT_PROVIDER, apiKey: '', assistantOn: false, assistantModel: '', fastOn: false, fastModel: '' }

const ON_FIELD = { assistant: 'assistantOn', fast: 'fastOn' } as const
const MODEL_FIELD = { assistant: 'assistantModel', fast: 'fastModel' } as const

/** Pure: the form for the stored settings. The key never reaches the browser, so it starts empty. */
export const formFromAiSettings = (settings: InstanceAiSettingsDto): InstanceAiForm => ({
  ...emptyInstanceAiForm,
  provider: settings.provider ?? DEFAULT_PROVIDER,
  assistantOn: settings.assistantModel !== null,
  assistantModel: settings.assistantModel ?? '',
  fastOn: settings.fastModel !== null,
  fastModel: settings.fastModel ?? '',
})

/** Pure: a key is stored for the provider in the form, so leaving the field empty keeps it. */
export const keyIsStored = (form: InstanceAiForm, settings: InstanceAiSettingsDto): boolean => settings.hasApiKey && settings.provider === form.provider

/** Pure: another provider. Its model names differ and a key typed for the old one is wrong, so both start again. */
export const withAiProvider = (form: InstanceAiForm, provider: AiProvider): InstanceAiForm => {
  if (provider === form.provider) return form
  return {
    ...form,
    provider,
    apiKey: '',
    assistantModel: modelSuggestions(provider, 'assistant')[0] ?? '',
    fastModel: modelSuggestions(provider, 'fast')[0] ?? '',
  }
}

/** Pure: a model switched on (an empty name gets the suggested one) or off (the name stays for later). */
export const withModelSlot = (form: InstanceAiForm, slot: AiModelSlot, on: boolean): InstanceAiForm => {
  const name = form[MODEL_FIELD[slot]]
  const filled = on && name.trim() === '' ? (modelSuggestions(form.provider, slot)[0] ?? '') : name
  return { ...form, [ON_FIELD[slot]]: on, [MODEL_FIELD[slot]]: filled }
}

/** Pure: both models off. Saving then turns AI off, with no test call. */
export const turnsAiOff = (form: InstanceAiForm): boolean => !form.assistantOn && !form.fastOn

const missing = (form: InstanceAiForm, settings: InstanceAiSettingsDto): InstanceAiErrors => ({
  ...(!turnsAiOff(form) && form.apiKey.trim() === '' && !keyIsStored(form, settings) ? { apiKey: 'instanceAi.errors.apiKeyMissing' } : {}),
  ...(form.assistantOn && form.assistantModel.trim() === '' ? { assistantModel: 'instanceAi.errors.modelMissing' } : {}),
  ...(form.fastOn && form.fastModel.trim() === '' ? { fastModel: 'instanceAi.errors.modelMissing' } : {}),
})

const draftOf = (form: InstanceAiForm): unknown => ({
  provider: form.provider,
  ...(form.apiKey.trim() === '' ? {} : { apiKey: form.apiKey }),
  assistantModel: form.assistantOn ? form.assistantModel : null,
  fastModel: form.fastOn ? form.fastModel : null,
})

const KNOWN: readonly InstanceAiField[] = ['apiKey', 'assistantModel', 'fastModel']
const fieldOf = (path: readonly PropertyKey[]): InstanceAiField | null => {
  const first = String(path[0] ?? '')
  return (KNOWN as readonly string[]).includes(first) ? (first as InstanceAiField) : null
}

/** Pure: the input for the api, validated with the same schema; or the message of each invalid field. */
export const instanceAiInput = (form: InstanceAiForm, settings: InstanceAiSettingsDto): InstanceAiInputResult => {
  const empty = missing(form, settings)
  if (Object.keys(empty).length > 0) return { ok: false, errors: empty }
  const parsed = instanceAiSettingsInputSchema.safeParse(draftOf(form))
  if (parsed.success) return { ok: true, input: parsed.data }
  const errors = parsed.error.issues.reduce<InstanceAiErrors>((acc, issue) => {
    const field = fieldOf(issue.path)
    if (!field || field in acc) return acc
    return { ...acc, [field]: field === 'apiKey' ? 'instanceAi.errors.apiKey' : 'instanceAi.errors.model' }
  }, {})
  return { ok: false, errors }
}
