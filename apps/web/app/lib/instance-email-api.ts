import { EMAIL_TEST_FAILED, instanceEmailSettingsSchema, type InstanceEmailSettingsDto, type InstanceEmailSettingsInput } from '@candydati/domain'
import { ApiFailure, callApi, defaultFailureKey, type FailureInfo, type FailureKey } from './api-call'
import type { JobApiRequest } from './job-api'

const SETTINGS = '/api/v1/instance/email-settings'

const testRefused = (failure: FailureInfo): boolean => failure.issues.some((issue) => issue.path === 'test' && issue.message === EMAIL_TEST_FAILED)

/** A refused test email (nothing saved) has its own message; other validation refusals say the settings are not valid. */
export const instanceEmailFailureKey: FailureKey = (failure) => {
  if (testRefused(failure)) return 'instanceEmail.errors.testFailed'
  if (failure.code === 'validation_failed') return 'instanceEmail.errors.invalid'
  return defaultFailureKey(failure)
}

/** The provider refused the test email: the screen adds a hint on what to check. */
export const isTestFailure = (error: unknown): boolean => error instanceof ApiFailure && testRefused(error.failure)

/** How the instance sends email. Any signed-in member may read it; never a secret, only whether one is stored. */
export const getInstanceEmailSettings = async (request: JobApiRequest): Promise<InstanceEmailSettingsDto> => (await callApi(request, SETTINGS, instanceEmailSettingsSchema)).data

/** Sends a test email to the admin with these settings and saves them only if the provider accepted it. */
export const saveInstanceEmailSettings = async (request: JobApiRequest, input: InstanceEmailSettingsInput): Promise<InstanceEmailSettingsDto> =>
  (await callApi(request, SETTINGS, instanceEmailSettingsSchema, { method: 'PUT', body: input }, instanceEmailFailureKey)).data
