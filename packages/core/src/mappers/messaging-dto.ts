import { SYSTEM_SENDER, type DomainRecord, type DomainStatus, type EmailTemplateKind, type MessageDirection, type MessageStatus } from '@tt/domain';
import type { EmailSettingsView, EmailTemplateView, MessageView } from '../use-cases/messaging/views.js';

export interface EmailTemplateDto {
  readonly id: string;
  readonly name: string;
  readonly kind: EmailTemplateKind;
  readonly subject: string;
  readonly body: string;
  /** True for a built-in default the organization has not edited (id `default:<kind>`). */
  readonly isDefault: boolean;
  /** null for an untouched built-in default. */
  readonly updatedAt: string | null;
}

export interface MessageDto {
  readonly id: string;
  readonly direction: MessageDirection;
  readonly subject: string;
  readonly bodyText: string;
  readonly status: MessageStatus;
  /** null for inbound messages; `{ id: 'system', name: 'system' }` for the automatic receipt. */
  readonly sentBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
  readonly sentAt: string | null;
  readonly unverifiedSender: boolean;
  /** A short code (`delivery_failed`, `delivery_rejected`, `recipient_missing`, `queue_unavailable`). */
  readonly error: string | null;
}

export interface EmailSettingsDto {
  readonly senderName: string;
  readonly fromAddress: string | null;
  readonly domain: { readonly name: string; readonly status: DomainStatus; readonly records: readonly DomainRecord[] } | null;
  readonly effectiveFrom: string;
}

export const toEmailTemplateDto = (view: EmailTemplateView): EmailTemplateDto => ({
  id: view.id,
  name: view.name,
  kind: view.kind,
  subject: view.subject,
  body: view.body,
  isDefault: view.isDefault,
  updatedAt: view.updatedAt ? view.updatedAt.toISOString() : null,
});

export const toMessageDto = ({ message, senderName }: MessageView): MessageDto => ({
  id: message.id,
  direction: message.direction,
  subject: message.subject,
  bodyText: message.bodyText,
  status: message.status,
  sentBy:
    message.sentBy === null
      ? null
      : message.sentBy === SYSTEM_SENDER
        ? { id: SYSTEM_SENDER, name: SYSTEM_SENDER }
        : { id: message.sentBy, name: senderName ?? 'Former member' },
  createdAt: message.createdAt.toISOString(),
  sentAt: message.sentAt ? message.sentAt.toISOString() : null,
  unverifiedSender: message.unverifiedSender,
  error: message.error,
});

export const toEmailSettingsDto = (view: EmailSettingsView): EmailSettingsDto => ({
  senderName: view.senderName,
  fromAddress: view.fromAddress,
  domain: view.domain,
  effectiveFrom: view.effectiveFrom,
});
