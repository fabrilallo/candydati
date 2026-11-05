import type { LinkedInPrefill, PublicPrivacyNoticeDto } from '@candydati/domain'
import type { Ref } from 'vue'
import { ApiFailure } from '@/lib/api-call'
import { applicationCampaign, applicationOrigin } from '@/lib/application-origin'
import { emptyApplyValues, needsNoticeReload, submitApplication, toApplicationForm, type ApplyErrors, type ApplyValues } from '@/lib/application-form'
import { checkCvFile } from '@/lib/cv-file'
import { withLinkedInPrefill } from '@/lib/linkedin-prefill'
import { fetchPublicJob } from '@/lib/job-api'

const CV_ERRORS = { empty: 'apply.cv.errors.empty', too_large: 'apply.cv.errors.tooLarge', unsupported: 'apply.cv.errors.unsupported' } as const

const currentOrigin = () => applicationOrigin({ search: window.location.search, referrer: document.referrer, host: window.location.host })

const currentCampaign = () => applicationCampaign(window.location.search)

const fetchNotice = async (request: ReturnType<typeof useJobsApi>, target: { readonly org: string; readonly job: string }): Promise<PublicPrivacyNoticeDto | null> => {
  try {
    return (await fetchPublicJob(request, target.org, target.job)).privacyNotice ?? null
  } catch (error) {
    console.error('[apply] could not reload the privacy notice', error instanceof Error ? error.message : error)
    return null
  }
}

const withoutError = (errors: ApplyErrors, field: string): ApplyErrors => Object.fromEntries(Object.entries(errors).filter(([name]) => name !== field))

/** What "Fill in with LinkedIn" may fill: shown in the fields for the candidate to review, never sent by itself. */
const PREFILLED_FIELDS: readonly string[] = ['firstName', 'lastName', 'email']

const fillFromLinkedIn = (values: Ref<ApplyValues>, errors: Ref<ApplyErrors>, prefill: LinkedInPrefill): void => {
  values.value = withLinkedInPrefill(values.value, prefill)
  errors.value = PREFILLED_FIELDS.reduce(withoutError, errors.value)
}

/**
 * State of the public application form: values, CV, per-field errors (translation keys in the ad's language), the
 * submission and its outcome. If the notice changed meanwhile, the new one is loaded and consent is asked again
 * (`noticeChanged`). `fill` puts in what "Fill in with LinkedIn" gave, for the candidate to review.
 */
export const useApplyForm = (target: { readonly org: string; readonly job: string }, notice: Ref<PublicPrivacyNoticeDto>) => {
  const request = useJobsApi()
  const values = ref<ApplyValues>(emptyApplyValues())
  const file = ref<File | null>(null)
  const errors = ref<ApplyErrors>({})
  const pending = ref(false)
  const errorKey = ref<string | null>(null)
  const done = ref(false)
  const noticeChanged = ref(false)

  const setField = <K extends keyof ApplyValues>(key: K, value: ApplyValues[K]): void => {
    values.value = { ...values.value, [key]: value }
    errors.value = withoutError(errors.value, key)
  }
  const fill = (prefill: LinkedInPrefill): void => fillFromLinkedIn(values, errors, prefill)
  const setFile = (next: File | null): void => {
    const check = next ? checkCvFile(next) : null
    file.value = check && !check.ok ? null : next
    errors.value = { ...withoutError(errors.value, 'cv'), ...(check && !check.ok ? { cv: CV_ERRORS[check.reason] } : {}) }
  }

  const reloadNotice = async (): Promise<void> => {
    const fresh = await fetchNotice(request, target)
    if (fresh) notice.value = fresh
    values.value = { ...values.value, selection: false, talentPool: false }
    noticeChanged.value = true
  }

  /** Returns the field to focus when something needs attention, null otherwise. */
  const submit = async (turnstileToken?: string): Promise<string | null> => {
    errorKey.value = null
    const result = toApplicationForm(values.value, notice.value.version)
    const fieldErrors: ApplyErrors = { ...(result.ok ? {} : result.errors), ...(file.value ? {} : { cv: errors.value.cv ?? 'apply.cv.errors.required' }) }
    if (!result.ok || !file.value) {
      errors.value = fieldErrors
      return Object.keys(fieldErrors)[0] ?? null
    }
    pending.value = true
    try {
      await submitApplication(request, target.org, target.job, result.form, file.value, currentOrigin(), turnstileToken, currentCampaign())
      done.value = true
      return null
    } catch (error) {
      errorKey.value = error instanceof ApiFailure ? error.key : 'apply.errors.generic'
      if (needsNoticeReload(error)) await reloadNotice()
      return null
    } finally {
      pending.value = false
    }
  }

  return { values, file, errors, pending, errorKey, done, noticeChanged, setField, setFile, fill, submit }
}
