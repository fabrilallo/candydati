import { APPROVAL_RULES, checkApproval, jobApprovalStatusSchema, salarySchema, type JobApprovalDto, type JobApprovalStatusDto } from '@candydati/domain'
import { z } from 'zod'
import { jobApprovalPath, jobApprovalRequestPath } from './api-paths'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

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

const amount = (value: string): number | undefined => (/^\d+$/.test(value.trim()) && Number(value.trim()) > 0 ? Number(value.trim()) : undefined)

/** The salary fields of the editor form, as typed. */
export interface ApprovalSalaryForm {
  readonly salaryMin: string
  readonly salaryMax: string
  readonly currency: string
  readonly period: string
}

/** Who is told the approval status of an ad: the domain rule (`checkApproval`) decides, this only shapes its input. */
export const approvalState = (requireApproval: boolean | null, approval: JobApprovalDto | null, form: ApprovalSalaryForm): ApprovalState => {
  if (requireApproval !== true) return 'off'
  if (approval === null) return 'missing'
  const salary = salarySchema.safeParse({ min: amount(form.salaryMin), max: amount(form.salaryMax), currency: form.currency || undefined, period: form.period || undefined })
  // A salary the form cannot yet express is not for approval to judge: the publication itself refuses it.
  if (!salary.success) return 'approved'
  return checkApproval(true, { ...approval, approvedAt: new Date(approval.approvedAt) }, salary.data) === null ? 'approved' : 'exceeded'
}

export const APPROVAL_ERROR_KEYS: readonly string[] = ['job.approval.errors.required', 'job.approval.errors.rangeExceeded']

const APPROVAL_ERROR_KEY: Readonly<Record<(typeof APPROVAL_RULES)[number], string>> = {
  approval_required: 'job.approval.errors.required',
  approval_range_exceeded: 'job.approval.errors.rangeExceeded',
}

/** Pure: the translation key of a publish refusal about approval, or null for any other failure. */
export const approvalErrorKey = (code: string | null, messages: readonly string[] = []): string | null => {
  const all = [code, ...messages]
  // Range first: a publish that is both refused for range and missing the approval reads as the more specific one.
  const rule = [...APPROVAL_RULES].reverse().find((candidate) => all.includes(candidate))
  return rule === undefined ? null : APPROVAL_ERROR_KEY[rule]
}

/** Where "Chiedi l'approvazione" leads: the request form, with the title of the ad already written. */
export const approvalRequestPath = (title: string): string => {
  const trimmed = title.trim()
  return trimmed === '' ? '/app/job-requests/new' : `/app/job-requests/new?title=${encodeURIComponent(trimmed)}`
}
