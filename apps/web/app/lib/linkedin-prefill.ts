import { LINKEDIN_ROUTE_BASE, linkedInPrefillResultSchema, type LinkedInPrefill, type LinkedInPrefillResult } from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { ApplyValues } from './application-form'
import type { JobApiRequest } from './job-api'

const statusSchema = z.object({ enabled: z.boolean() })

/** Whether the instance has a LinkedIn app. Any doubt is "no": the form works the same without the button. */
export const fetchLinkedInEnabled = async (request: JobApiRequest): Promise<boolean> => {
  try {
    return (await callApi(request, `${LINKEDIN_ROUTE_BASE}/status`, statusSchema)).data.enabled
  } catch (error) {
    console.error('[apply] could not read the LinkedIn setting', error instanceof Error ? error.message : error)
    return false
  }
}

/** What LinkedIn filled in, once (the server clears it on this read). A failure reads as "failed": the candidate types. */
export const takeLinkedInPrefill = async (request: JobApiRequest): Promise<LinkedInPrefillResult> => {
  try {
    return (await callApi(request, `${LINKEDIN_ROUTE_BASE}/prefill`, linkedInPrefillResultSchema, { method: 'POST' })).data
  } catch (error) {
    console.error('[apply] could not read the LinkedIn prefill', error instanceof Error ? error.message : error)
    return { status: 'failed' }
  }
}

/** The form with what LinkedIn gave; empty fields from LinkedIn leave the form's value. Returns a new object. */
export const withLinkedInPrefill = (values: ApplyValues, prefill: LinkedInPrefill): ApplyValues => ({
  ...values,
  ...(prefill.firstName ? { firstName: prefill.firstName } : {}),
  ...(prefill.lastName ? { lastName: prefill.lastName } : {}),
  ...(prefill.email ? { email: prefill.email } : {}),
})

/** The message shown after coming back from LinkedIn. */
export const LINKEDIN_NOTICE_KEYS = {
  filled: 'apply.linkedin.filled',
  cancelled: 'apply.linkedin.cancelled',
  failed: 'apply.linkedin.failed',
} as const satisfies Record<Exclude<LinkedInPrefillResult['status'], 'none'>, string>
