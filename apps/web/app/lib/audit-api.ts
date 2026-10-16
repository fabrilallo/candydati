import type { PageMeta } from '@candydati/domain'
import { z } from 'zod'
import { AppError, authErrorKey, errorKeyOf } from './auth-errors'
import type { AuditEventView } from './audit-view'

export const AUDIT_PAGE_SIZE = 20

/** Transport seam: `GET url` returning the HTTP status and the parsed JSON body (or text). Never throws on non-2xx. */
export type ApiRequest = (url: string) => Promise<{ readonly status: number; readonly body: unknown }>

const eventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  actor: z.object({ type: z.string(), id: z.string().nullable(), onBehalfOfUserId: z.string().nullable(), name: z.string().nullable() }),
  action: z.string(),
  target: z.object({ type: z.string(), id: z.string() }),
  metadata: z.record(z.string(), z.unknown()),
  occurredAt: z.string(),
})
const metaSchema = z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() })
const envelopeSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data: z.array(eventSchema), error: z.null(), meta: metaSchema }),
  z.object({ success: z.literal(false), data: z.null(), error: z.object({ code: z.string(), message: z.string() }) }),
])

export interface AuditPage {
  readonly events: readonly AuditEventView[]
  readonly meta: PageMeta
}

export const auditLogUrl = (page: number, limit: number): string => `/api/v1/audit-log?page=${page}&limit=${limit}`

export const pageCount = (meta: PageMeta): number => Math.max(1, Math.ceil(meta.total / meta.limit))

const request = async (send: ApiRequest, url: string) => {
  try {
    return await send(url)
  } catch (cause) {
    console.error('[audit-api] request failed', cause instanceof Error ? cause.message : cause)
    throw new AppError('errors.unreachable')
  }
}

/** Reads one page of the audit log. Envelope errors become `AppError`s with a translation key; the body is validated. */
export const fetchAuditLog = async (send: ApiRequest, page: number, limit: number = AUDIT_PAGE_SIZE): Promise<AuditPage> => {
  const { status, body } = await request(send, auditLogUrl(page, limit))
  const parsed = envelopeSchema.safeParse(body)
  if (!parsed.success) {
    if (status >= 400) throw new AppError(authErrorKey({ status }))
    console.error('[audit-api] unexpected response shape', z.prettifyError(parsed.error))
    throw new AppError('errors.generic', 'invalid_response')
  }
  if (!parsed.data.success) {
    const { code } = parsed.data.error
    throw new AppError(authErrorKey({ status }), code)
  }
  return { events: parsed.data.data, meta: parsed.data.meta }
}

export type AuditLoad = { readonly page: AuditPage; readonly errorKey: null } | { readonly page: null; readonly errorKey: string }

/** Never throws: the screen gets either a page or the translation key to show (nothing is swallowed, nothing crashes the render). */
export const loadAuditPage = async (send: ApiRequest, page: number, limit: number = AUDIT_PAGE_SIZE): Promise<AuditLoad> => {
  try {
    return { page: await fetchAuditLog(send, page, limit), errorKey: null }
  } catch (error) {
    return { page: null, errorKey: errorKeyOf(error) }
  }
}
