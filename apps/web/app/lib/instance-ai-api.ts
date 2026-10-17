import { AI_TEST_FAILED, instanceAiSettingsSchema, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain'
import { ApiFailure, callApi, defaultFailureKey, type FailureInfo, type FailureKey } from './api-call'
import { isAiProvider } from './ai-models'
import type { InstanceAiErrors, InstanceAiField } from './instance-ai-view'
import type { JobApiRequest } from './job-api'

const SETTINGS = '/api/v1/instance/ai-settings'
const DETAIL_PATH = 'test.detail'

const testRefused = (failure: FailureInfo): boolean => failure.issues.some((issue) => issue.path === 'test' && issue.message === AI_TEST_FAILED)

/** A model that did not answer the test call (nothing saved) has its own message; other refusals say it is not valid. */
export const instanceAiFailureKey: FailureKey = (failure) => {
  if (testRefused(failure)) return 'instanceAi.errors.testFailed'
  if (failure.code === 'validation_failed') return 'instanceAi.errors.invalid'
  return defaultFailureKey(failure)
}

/** A model refused the test call: the screen adds the provider's words and what to check. */
export const isAiTestFailure = (error: unknown): boolean => error instanceof ApiFailure && testRefused(error.failure)

/** What the provider answered when the test call failed, or null. Shown as data, never as markup. */
export const testFailureDetail = (error: unknown): string | null => {
  if (!(error instanceof ApiFailure) || !testRefused(error.failure)) return null
  return error.failure.issues.find((issue) => issue.path === DETAIL_PATH)?.message ?? null
}

const SLOTS: readonly string[] = ['assistant', 'fast']

/** Pure: the field an issue of the server belongs to, with its message key; null for issues about the whole form. */
const fieldIssue = (path: string): readonly [InstanceAiField, string] | null => {
  const [head = '', next = ''] = path.split('.')
  if (head === 'keys' && isAiProvider(next)) return [`keys.${next}`, 'instanceAi.errors.apiKeyMissing']
  if (SLOTS.includes(head) && next === 'model') return [head as InstanceAiField, 'instanceAi.errors.model']
  return null
}

/** The fields the server refused (a provider in use without a key, a model name), to show next to each field. */
export const serverFieldErrors = (error: unknown): InstanceAiErrors => {
  if (!(error instanceof ApiFailure)) return {}
  return error.failure.issues.reduce<InstanceAiErrors>((acc, issue) => {
    const found = fieldIssue(issue.path)
    return found && !(found[0] in acc) ? { ...acc, [found[0]]: found[1] } : acc
  }, {})
}

/** Which models the instance uses. Any signed-in member may read it; never the key, only whether one is stored. */
export const getInstanceAiSettings = async (request: JobApiRequest): Promise<InstanceAiSettingsDto> => (await callApi(request, SETTINGS, instanceAiSettingsSchema)).data

/** Sends a tiny test call to each chosen model and saves only if they all answered. */
export const saveInstanceAiSettings = async (request: JobApiRequest, input: InstanceAiSettingsInput): Promise<InstanceAiSettingsDto> =>
  (await callApi(request, SETTINGS, instanceAiSettingsSchema, { method: 'PUT', body: input }, instanceAiFailureKey)).data
