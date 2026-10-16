import { z } from 'zod';
import { DOMAIN_STATUSES, MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../messaging/message.js';
import { EMAIL_TEMPLATE_KINDS } from '../messaging/template.js';
import { isoDate } from './common.js';

/** `MessageDto` of `@candydati/core`. `sentBy` is null for inbound mail and `{ id: 'system', name: 'system' }` for the automatic receipt. */
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
  /** An email of the past brought by a migration: shown as such, never sent from here. */
  historical: z.boolean(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const emailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(EMAIL_TEMPLATE_KINDS),
  subject: z.string(),
  body: z.string(),
  isDefault: z.boolean(),
  updatedAt: isoDate.nullable(),
});
export type EmailTemplateDto = z.infer<typeof emailTemplateSchema>;

/** A DNS record to publish (the domain's `DomainRecord`). */
export const dnsRecordSchema = z.object({ type: z.string(), name: z.string(), value: z.string(), status: z.enum(DOMAIN_STATUSES).optional() });
export type DnsRecordDto = z.infer<typeof dnsRecordSchema>;

export const emailSettingsSchema = z.object({
  senderName: z.string(),
  fromAddress: z.string().nullable(),
  domain: z.object({ name: z.string(), status: z.enum(DOMAIN_STATUSES), records: z.array(dnsRecordSchema) }).nullable(),
  effectiveFrom: z.string(),
});
export type EmailSettingsDto = z.infer<typeof emailSettingsSchema>;

/** `MessagePreview` of `@candydati/core`, returned as is by the api. */
export const templatePreviewSchema = z.object({ subject: z.string(), body: z.string(), unknownVariables: z.array(z.string()) });
export type TemplatePreviewDto = z.infer<typeof templatePreviewSchema>;

/** `POST /messages`: how many messages were queued and how many recipients failed. */
export const sendResultSchema = z.object({ queued: z.number().int().nonnegative(), failed: z.number().int().nonnegative() });
