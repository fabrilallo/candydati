import { sourcingNoticeViewSchema, type SourcingNoticeViewDto } from '@candydati/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** The page a sourced person opens from their GDPR art. 14 notice (no login: the token in the path is the credential). */
const path = (token: string): string => `/api/v1/public/sourcing-notice/${encodeURIComponent(token)}`

export type SourcingNoticeFailure = 'invalid' | 'rateLimited' | 'unavailable'
export type SourcingNoticeLoad = { readonly kind: 'ok'; readonly data: SourcingNoticeViewDto } | { readonly kind: 'failed'; readonly failure: SourcingNoticeFailure }

/** Pure: what the page says when the link does not work. Unknown, renewed, erased and expired are all "invalid". */
export const sourcingNoticeFailure = (error: unknown): SourcingNoticeFailure => {
  if (!(error instanceof ApiFailure)) return 'unavailable'
  if (error.failure.status === 429) return 'rateLimited'
  return error.failure.status === 404 || error.failure.status === 400 ? 'invalid' : 'unavailable'
}

/** Never throws: the page shows what is kept, or why it cannot. */
export const loadSourcingNotice = async (request: JobApiRequest, token: string): Promise<SourcingNoticeLoad> => {
  try {
    return { kind: 'ok', data: (await callApi(request, path(token), sourcingNoticeViewSchema)).data }
  } catch (error) {
    return { kind: 'failed', failure: sourcingNoticeFailure(error) }
  }
}

/** Erase and do not contact me: resolves with the failure, or null when done. */
export const objectToSourcing = async (request: JobApiRequest, token: string): Promise<SourcingNoticeFailure | null> => {
  try {
    await callApi(request, `${path(token)}/object`, z.object({ erased: z.literal(true) }), { method: 'POST', body: {} })
    return null
  } catch (error) {
    return sourcingNoticeFailure(error)
  }
}
