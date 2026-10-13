import { z } from 'zod'
import { DOMAIN_STATUSES, EMAIL_TEMPLATE_KINDS, MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '@tt/domain'

/** Zod mirrors of the Phase 3 DTOs (phase 3 contract, "DTOs" and "HTTP"). Every response is checked before use. */
const isoDate = z.iso.datetime({ offset: true })

export const messageSchema = z.object({
  id: z.string(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  subject: z.string(),
  bodyText: z.string(),
  status: z.enum(MESSAGE_STATUSES),
  sentBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  createdAt: isoDate,
  sentAt: isoDate.nullable(),
  unverifiedSender: z.boolean(),
  error: z.string().nullable(),
})
export type MessageDto = z.infer<typeof messageSchema>

export const emailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(EMAIL_TEMPLATE_KINDS),
  subject: z.string(),
  body: z.string(),
  isDefault: z.boolean(),
  updatedAt: isoDate.nullable(),
})
export type EmailTemplateDto = z.infer<typeof emailTemplateSchema>

/** The contract does not detail a DNS record: type, host and value are what any provider returns. */
export const dnsRecordSchema = z.object({
  type: z.string(),
  name: z.string(),
  value: z.string(),
  status: z.string().nullable().optional(),
})
export type DnsRecordDto = z.infer<typeof dnsRecordSchema>

export const emailSettingsSchema = z.object({
  senderName: z.string(),
  fromAddress: z.string().nullable(),
  domain: z.object({ name: z.string(), status: z.enum(DOMAIN_STATUSES), records: z.array(dnsRecordSchema) }).nullable(),
  effectiveFrom: z.string(),
})
export type EmailSettingsDto = z.infer<typeof emailSettingsSchema>

export const templatePreviewSchema = z.object({ subject: z.string(), body: z.string(), unknownVariables: z.array(z.string()) })
export type TemplatePreviewDto = z.infer<typeof templatePreviewSchema>

export const queuedSchema = z.object({ queued: z.number().int().nonnegative() })
