import { AI_TEST_FAILED, instanceAiSettingsSchema, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain'
import { ApiFailure, callApi, defaultFailureKey, type FailureInfo, type FailureKey } from './api-call'
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

/** Which models the instance uses. Any signed-in member may read it; never the key, only whether one is stored. */
export const getInstanceAiSettings = async (request: JobApiRequest): Promise<InstanceAiSettingsDto> => (await callApi(request, SETTINGS, instanceAiSettingsSchema)).data

/** Sends a tiny test call to each chosen model and saves only if they all answered. */
export const saveInstanceAiSettings = async (request: JobApiRequest, input: InstanceAiSettingsInput): Promise<InstanceAiSettingsDto> =>
  (await callApi(request, SETTINGS, instanceAiSettingsSchema, { method: 'PUT', body: input }, instanceAiFailureKey)).data
