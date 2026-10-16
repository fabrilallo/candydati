import { applicationFormSchema, type ApplicationForm, type ConsentScope, receivedSchema } from '@candydati/domain'
import { ApiFailure, callApi, type FailureInfo } from './api-call'
import type { JobApiRequest } from './job-api'

/** What the candidate types and ticks on the public form. Strings stay strings until the payload is built. */
export interface ApplyValues {
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly phone: string
  readonly linkedinUrl: string
  readonly message: string
  /** Required consent: the selection for this position. */
  readonly selection: boolean
  /** Optional, separate consent: the talent pool for future positions. */
  readonly talentPool: boolean
  /** Honeypot, hidden from people. */
  readonly website: string
}

export type ApplyField = Exclude<keyof ApplyValues, 'talentPool' | 'website'> | 'cv'
export type ApplyErrors = Partial<Record<ApplyField, string>>

export const emptyApplyValues = (): ApplyValues => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  linkedinUrl: '',
  message: '',
  selection: false,
  talentPool: false,
  website: '',
})

/** `linkedin.com/in/x` is what people paste: give it a scheme so it is a URL. */
const withScheme = (url: string): string => (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`)
const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim())

const ISSUE_KEYS: Readonly<Record<string, (code: string) => string>> = {
  firstName: (code) => (code === 'too_big' ? 'apply.validation.nameMax' : 'apply.validation.required'),
  lastName: (code) => (code === 'too_big' ? 'apply.validation.nameMax' : 'apply.validation.required'),
  email: () => 'apply.validation.email',
  phone: () => 'apply.validation.phone',
  linkedinUrl: () => 'apply.validation.url',
  message: () => 'apply.validation.messageMax',
  consentScopes: () => 'apply.validation.selection',
}
const FIELD_OF: Readonly<Record<string, ApplyField>> = { consentScopes: 'selection' }

export type ApplyResult = { readonly ok: true; readonly form: ApplicationForm } | { readonly ok: false; readonly errors: ApplyErrors }

/** Pure: the contract payload (`applicationFormSchema`) or one translation key per field that needs attention. */
export const toApplicationForm = (values: ApplyValues, privacyNoticeVersion: number): ApplyResult => {
  const linkedin = optional(values.linkedinUrl)
  const scopes: ConsentScope[] = [...(values.selection ? ['selection' as const] : []), ...(values.talentPool ? ['talent_pool' as const] : [])]
  const parsed = applicationFormSchema.safeParse({
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email.trim(),
    phone: optional(values.phone),
    linkedinUrl: linkedin === undefined ? undefined : withScheme(linkedin),
    message: values.message,
    consentScopes: values.selection ? scopes : [],
    privacyNoticeVersion,
  })
  if (!parsed.success) {
    const errors = parsed.error.issues.reduce<ApplyErrors>((acc, issue) => {
      const path = String(issue.path[0] ?? '')
      const field = FIELD_OF[path] ?? (path as ApplyField)
      const key = ISSUE_KEYS[path]?.(issue.code)
      return key && !(field in acc) ? { ...acc, [field]: key } : acc
    }, {})
    return { ok: false, errors }
  }
  const form = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined)) as ApplicationForm
  return { ok: true, form: values.website === '' ? form : { ...form, website: values.website } }
}

const has = (failure: FailureInfo, token: string): boolean => failure.code === token || failure.message === token

/** Pure: the message to show for a failed submission. The candidate is never told more than they need. */
export const applicationErrorKey = (failure: FailureInfo): string => {
  if (has(failure, 'privacy_notice_outdated')) return 'apply.errors.outdated'
  if (has(failure, 'already_applied')) return 'apply.errors.alreadyApplied'
  if (has(failure, 'unsupported_file') || failure.status === 415) return 'apply.errors.unsupportedFile'
  const byStatus: Readonly<Record<number, string>> = { 0: 'apply.errors.unreachable', 404: 'apply.errors.closed', 413: 'apply.errors.tooLarge', 422: 'apply.errors.invalid', 429: 'apply.errors.tooMany' }
  return byStatus[failure.status] ?? 'apply.errors.generic'
}

/** The notice changed while the candidate was reading: reload it and ask for consent again. */
export const needsNoticeReload = (error: unknown): boolean => error instanceof ApiFailure && has(error.failure, 'privacy_notice_outdated')

export const applicationsUrl = (org: string, job: string): string =>
  `/api/v1/public/organizations/${encodeURIComponent(org)}/jobs/${encodeURIComponent(job)}/applications`

/**
 * Multipart: `data` is the JSON of the form (plus `origin`, the short source label of `application-origin.ts`, and the Turnstile answer when the check is on), `cv`
 * the file. No account, no session.
 */
export const submitApplication = async (request: JobApiRequest, org: string, job: string, form: ApplicationForm, cv: File, origin?: string, turnstileToken?: string): Promise<void> => {
  const body = new FormData()
  body.append('data', JSON.stringify({ ...form, ...(origin === undefined ? {} : { origin }), ...(turnstileToken ? { turnstileToken } : {}) }))
  body.append('cv', cv, cv.name)
  await callApi(request, applicationsUrl(org, job), receivedSchema, { method: 'POST', body }, applicationErrorKey)
}
