import type { DomainRecord, DomainStatus, EmailTemplateKind, Message } from '@tt/domain';

/** A stored template or an untouched default (`isDefault`, id `default:<kind>`, `updatedAt` null). */
export interface EmailTemplateView {
  readonly id: string;
  readonly name: string;
  readonly kind: EmailTemplateKind;
  readonly subject: string;
  readonly body: string;
  readonly isDefault: boolean;
  readonly updatedAt: Date | null;
}

export interface EmailSettingsView {
  readonly senderName: string;
  readonly fromAddress: string | null;
  readonly domain: { readonly name: string; readonly status: DomainStatus; readonly records: readonly DomainRecord[] } | null;
  /** The From header that would be used right now, e.g. `"Acme via Platform" <jobs@example.com>`. */
  readonly effectiveFrom: string;
}

export interface MessageView {
  readonly message: Message;
  /** Display name of the user who sent it; null when the message has no user sender (inbound, system). */
  readonly senderName: string | null;
}

export interface SendMessageResult {
  /** Messages queued with their delivery task. */
  readonly queued: number;
  /** Messages stored but whose task could not be queued: they are visibly `failed`. */
  readonly failed: number;
}

export interface MessagePreview {
  readonly subject: string;
  readonly body: string;
  readonly unknownVariables: readonly string[];
}

export type DeliverResult = 'sent' | 'failed' | 'skipped';

export interface InboundResult {
  readonly stored: boolean;
  readonly reason?: 'unknown_token' | 'unknown_application' | 'duplicate';
}
