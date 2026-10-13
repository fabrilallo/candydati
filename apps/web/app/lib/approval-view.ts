import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import {
  APPROVAL_RANGE_EXCEEDED,
  APPROVAL_REQUIRED,
  jobApprovalPath,
  jobApprovalRequestPath,
  jobApprovalStatusSchema,
  type JobApprovalDto,
  type JobApprovalStatusDto,
} from './phase9-contract'

export const getJobApproval = async (request: JobApiRequest, jobId: string): Promise<JobApprovalStatusDto> => (await callApi(request, jobApprovalPath(jobId), jobApprovalStatusSchema)).data

export const APPROVAL_REASON_MAX = 4000
/** Asks the approvers for a draft created directly (not from a request): the same flow as a request. */
export const requestJobApproval = async (request: JobApiRequest, jobId: string, reason: string): Promise<void> => {
  await callApi(request, jobApprovalRequestPath(jobId), z.unknown(), { method: 'POST', body: { reason: reason.trim() } })
}

/**
 * Where an ad stands with the organization's approval (Phase 9): `off` when approval is not required (or unknown),
 * `missing` when nobody approved it yet, `exceeded` when the salary in the form goes beyond the approved range.
 */
export type ApprovalState = 'off' | 'missing' | 'approved' | 'exceeded'

const amount = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null)

export const approvalState = (requireApproval: boolean | null, approval: JobApprovalDto, salaryMin: string, salaryMax: string): ApprovalState => {
  if (requireApproval !== true) return 'off'
  if (approval === null) return 'missing'
  const min = amount(salaryMin)
  const max = amount(salaryMax)
  const below = min !== null && min < approval.salaryMin
  const above = max !== null && max > approval.salaryMax
  return below || above ? 'exceeded' : 'approved'
}

export const APPROVAL_ERROR_KEYS: readonly string[] = ['job.approval.errors.required', 'job.approval.errors.rangeExceeded']

/** Pure: the translation key of a publish refusal about approval, or null for any other failure. */
export const approvalErrorKey = (code: string | null, messages: readonly string[] = []): string | null => {
  const all = [code, ...messages]
  if (all.includes(APPROVAL_RANGE_EXCEEDED)) return 'job.approval.errors.rangeExceeded'
  if (all.includes(APPROVAL_REQUIRED)) return 'job.approval.errors.required'
  return null
}

/** Where "Chiedi l'approvazione" leads: the request form, with the title of the ad already written. */
export const approvalRequestPath = (title: string): string => {
  const trimmed = title.trim()
  return trimmed === '' ? '/app/job-requests/new' : `/app/job-requests/new?title=${encodeURIComponent(trimmed)}`
}
