import { z } from 'zod';

export const MESSAGE_DIRECTIONS = ['outbound', 'inbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_STATUSES = ['queued', 'sent', 'failed', 'received'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** `sentBy` of messages the platform sends on its own (the application receipt). */
export const SYSTEM_SENDER = 'system';

export const MESSAGE_BODY_MAX = 20_000;
/** The original inbound text, quoted history included, kept apart from the body that is shown. */
export const RAW_TEXT_MAX = 50_000;
export const BULK_MESSAGE_MAX = 200;

/**
 * One email of a conversation (a conversation is one application). Inbound bodies are DATA: stored as text and never
 * rendered as HTML.
 */
export interface Message {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly candidateId: string;
  readonly direction: MessageDirection;
  readonly subject: string;
  readonly bodyText: string;
  readonly status: MessageStatus;
  readonly providerMessageId: string | null;
  /** User id, `system` for automatic messages, null for inbound ones. */
  readonly sentBy: string | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  /** A short code (`delivery_failed`, ...), never the provider's text. */
  readonly error: string | null;
  /** Inbound only: the text as received, before quoted history was removed. */
  readonly rawText: string | null;
  /** Inbound only: the sender address is not the candidate's. */
  readonly unverifiedSender: boolean;
  /** Inbound only: the `Message-ID` header, unique per organization (dedupe). */
  readonly inboundMessageId: string | null;
}

export const DOMAIN_STATUSES = ['verified', 'pending', 'failed', 'unsupported'] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

/** A DNS record the organization has to publish to verify its domain. */
export interface DomainRecord {
  readonly type: string;
  readonly name: string;
  readonly value: string;
  readonly status?: DomainStatus;
}

export interface EmailSettings {
  readonly organizationId: string;
  readonly senderName: string;
  /** Address on the organization's own domain; null: the default identity is used. */
  readonly fromAddress: string | null;
  readonly domain: string | null;
  readonly domainStatus: DomainStatus | null;
  readonly domainRecords: readonly DomainRecord[];
  readonly updatedAt: Date;
}

export const emailSettingsInputSchema = z.object({
  senderName: z.string().trim().min(1).max(80),
  fromAddress: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase())
    .nullable(),
});
export type EmailSettingsInput = z.input<typeof emailSettingsInputSchema>;

/** Random, base32 lowercase, 24+ chars: never derived from ids. */
export const CONVERSATION_TOKEN_PATTERN = /^[a-z2-7]{24,64}$/;
