import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import type { JobApiRequest } from './job-api'

export const SECURITY_SETTINGS_PATH = '/api/v1/settings/security'
/** The api's answer to an owner or admin without a second factor when the organization requires one. */
export const TWO_FACTOR_REQUIRED = 'two_factor_required'

const settingsSchema = z.object({ requireTwoFactor: z.boolean() })
export type SecuritySettings = z.infer<typeof settingsSchema>

/** The organization's security settings (session only). */
export const getSecuritySettings = async (request: JobApiRequest): Promise<SecuritySettings> => (await callApi(request, SECURITY_SETTINGS_PATH, settingsSchema)).data

export const setRequireTwoFactor = async (request: JobApiRequest, requireTwoFactor: boolean): Promise<SecuritySettings> =>
  (await callApi(request, SECURITY_SETTINGS_PATH, settingsSchema, { method: 'PUT', body: { requireTwoFactor } })).data

export const isTwoFactorRequired = (error: unknown): boolean => error instanceof ApiFailure && error.failure.code === TWO_FACTOR_REQUIRED

/** True when this person must enrol a second factor before using the app. Any other failure is not a reason to block. */
export const mustEnrolTwoFactor = async (request: JobApiRequest): Promise<boolean> => {
  try {
    await getSecuritySettings(request)
    return false
  } catch (error) {
    return isTwoFactorRequired(error)
  }
}

/** The secret of an `otpauth://` URI, grouped by four for typing it into an authenticator by hand. */
export const totpSecretOf = (uri: string): string | null => {
  const match = /[?&]secret=([A-Z2-7]+)/i.exec(uri)
  return match?.[1] ? match[1].toUpperCase().replace(/(.{4})(?=.)/g, '$1 ') : null
}
