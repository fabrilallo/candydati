import type { Outcome, PageMeta } from '@tt/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'
import { attentionItemSchema, decidedSchema, OPEN_APPLICATIONS_PREFIX, type AttentionItemDto } from './phase4-contract'

export const ATTENTION_PAGE_SIZE = 25
export type AttentionState = 'overdue' | 'due_soon'

export interface AttentionPage {
  readonly items: readonly AttentionItemDto[]
  readonly meta: PageMeta
}

export const attentionUrl = (state: AttentionState, page: number, limit: number = ATTENTION_PAGE_SIZE): string =>
  `/api/v1/applications/attention?state=${state}&page=${page}&limit=${limit}`

/** Open applications whose promised answer is late (`overdue`) or near (`due_soon`), most urgent first. */
export const listAttention = async (request: JobApiRequest, state: AttentionState, page: number, limit?: number): Promise<AttentionPage> => {
  const { data, meta } = await callApi(request, attentionUrl(state, page, limit), z.array(attentionItemSchema))
  if (!meta) throw new AppError('errors.generic', 'invalid_response')
  return { items: data, meta }
}

/** How many applications wait for an answer, late and near, read from the page totals (one row asked each). */
export const attentionTotals = async (request: JobApiRequest): Promise<{ readonly overdue: number; readonly dueSoon: number }> => {
  const [overdue, dueSoon] = await Promise.all([listAttention(request, 'overdue', 1, 1), listAttention(request, 'due_soon', 1, 1)])
  return { overdue: overdue.meta.total, dueSoon: dueSoon.meta.total }
}

/** One decision per application, made by a person who confirmed it. Returns how many were decided. */
export const decideApplications = async (request: JobApiRequest, applicationIds: readonly string[], outcome: Outcome): Promise<number> =>
  (await callApi(request, '/api/v1/applications/decide', decidedSchema, { method: 'POST', body: { applicationIds, outcome } })).data.decided

/** Pure: the open applications a refused close reports (`open_applications:<n>`), or null for any other failure. */
export const openApplicationsOf = (error: unknown): number | null => {
  if (!(error instanceof AppError)) return null
  const issues = error instanceof ApiFailure ? [...error.issues, ...error.failure.issues] : error.issues
  const found = issues.map((issue) => issue.message).find((message) => message.startsWith(OPEN_APPLICATIONS_PREFIX))
  if (found === undefined) return null
  const count = Number(found.slice(OPEN_APPLICATIONS_PREFIX.length))
  return Number.isInteger(count) && count >= 0 ? count : null
}
