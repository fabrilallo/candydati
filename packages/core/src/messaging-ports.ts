import type { ConsentTokenRepository } from './import-ports.js';
import type {
  DomainRecord,
  DomainStatus,
  EmailSettings,
  EmailTemplate,
  EmailTemplateKind,
  Locale,
  Message,
  MessageStatus,
} from '@candydati/domain';
import type { ApplicationRepository, CandidateRepository, UserDirectory } from './candidate-ports.js';
import type { TaskQueue } from './intake-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { CoreDeps } from './ports.js';
import type { ResponsePromiseRepository } from './report-ports.js';

export interface EmailTemplateRepository {
  /** Every template of the organization, newest first. Defaults are not stored: only edits and custom ones. */
  list(organizationId: string): Promise<readonly EmailTemplate[]>;
  findById(organizationId: string, id: string): Promise<EmailTemplate | null>;
  /** The edited default of a non-custom kind, if the organization has one. */
  findByKind(organizationId: string, kind: EmailTemplateKind): Promise<EmailTemplate | null>;
  /**
   * Insert or replace by (organizationId, id).
   * @throws ConflictError when another template of the same non-custom kind exists in the organization.
   */
  save(template: EmailTemplate): Promise<EmailTemplate>;
  /** True when a template was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
}

export interface EmailSettingsRepository {
  find(organizationId: string): Promise<EmailSettings | null>;
  /** Insert or replace by organization. */
  save(settings: EmailSettings): Promise<EmailSettings>;
}

/** One per application. The token is the secret part of the reply address. */
export interface Conversation {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly token: string;
}

export interface ConversationRepository {
  findByApplication(organizationId: string, applicationId: string): Promise<Conversation | null>;
  /** The token is global: it is how an inbound email finds its organization. */
  findByToken(token: string): Promise<Conversation | null>;
  /** Creates the conversation unless the application already has one; returns the stored one either way. */
  ensure(conversation: Conversation): Promise<Conversation>;
}

export type MessagePatch = Partial<Pick<Message, 'status' | 'sentAt' | 'providerMessageId' | 'error'>>;

export interface MessageRepository {
  /** @throws ConflictError when `inboundMessageId` already exists in the organization. */
  create(message: Message): Promise<Message>;
  /**
   * Status change guarded on the current status, column by column (`queued → sending` is the claim of one delivery).
   * Null when the message is not `from` any more: someone else changed it, nothing is written.
   */
  transition(organizationId: string, id: string, from: MessageStatus, patch: MessagePatch): Promise<Message | null>;
  findById(organizationId: string, id: string): Promise<Message | null>;
  findByInboundMessageId(organizationId: string, inboundMessageId: string): Promise<Message | null>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly Message[]>;
  /** Messages per application id; applications without messages are 0. */
  countByApplication(organizationId: string, applicationIds: readonly string[]): Promise<Readonly<Record<string, number>>>;
  /** Outbound messages to the candidate created at or after `since` (queued, sent or failed). */
  countOutboundSince(organizationId: string, candidateId: string, since: Date): Promise<number>;
  /** Messages the system itself sent in the organization (receipts and the like) created at or after `since`. */
  countSystemOutboundSince(organizationId: string, since: Date): Promise<number>;
}

export interface DomainCheck {
  readonly status: DomainStatus;
  /** DNS records to publish; empty when the provider has none to show. */
  readonly records: readonly DomainRecord[];
}

/** Sending-domain verification. Implemented by `@candydati/providers` (SMTP answers `unsupported`). */
export interface EmailIdentity {
  domainStatus(domain: string): Promise<DomainCheck>;
}

export interface OutboundEmail {
  /** Formatted address: `"Acme via Platform" <hr@example.com>`. */
  readonly from: string;
  readonly replyTo: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Same key, same email: a provider that supports it sends a repeated request only once. */
  readonly idempotencyKey?: string | undefined;
}

/**
 * Sends one email. A throw with `permanent: true` (rejected address, invalid sender) is not retried; any other throw
 * is transient and the worker retries it.
 */
export interface EmailSender {
  send(email: OutboundEmail): Promise<{ readonly providerMessageId: string }>;
  /** True when the provider honours `idempotencyKey`: resending after an unconfirmed attempt cannot duplicate the email. */
  readonly deduplicates?: boolean | undefined;
}

/** Instance configuration, from `PLATFORM_*` and `EMAIL_*` env. */
export interface MessagingConfig {
  readonly platformName: string;
  /** Public base URL of the web app (links to the careers pages). */
  readonly platformUrl: string;
  /** `EMAIL_FROM_LOCAL`, e.g. `jobs`. */
  readonly emailFromLocal: string;
  /** `EMAIL_DOMAIN`: domain of the default From address. */
  readonly emailDomain: string;
  /** `EMAIL_INBOUND_DOMAIN`: domain of the tokenized Reply-To address. */
  readonly emailInboundDomain: string;
  /** Locale of the default templates shown in the settings. */
  readonly defaultLocale: Locale;
  /** `PLATFORM_TIME_ZONE`: IANA zone dates in emails are printed in. Defaults to UTC when absent. */
  readonly timeZone?: string;
}

export interface MessagingDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly organizations: OrganizationDirectory;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly users: UserDirectory;
  readonly templates: EmailTemplateRepository;
  readonly settings: EmailSettingsRepository;
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  /** A person's message answers the promise of the current stage. */
  readonly promises: ResponsePromiseRepository;
  readonly queue: TaskQueue;
  readonly identity: EmailIdentity;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly newId: () => string;
  /** 24+ chars, base32 lowercase, from a CSPRNG. Randomness lives in deps, never in core. */
  readonly newToken: () => string;
  readonly now: () => Date;
}

/** What `submitApplication` needs to queue the receipt. */
export interface ReceiptDeps
  extends Pick<MessagingDeps, 'templates' | 'conversations' | 'messages' | 'config' | 'newToken'> {
  /** Receipts one organization may queue in 24 hours: the form is public, so receipts must not be a way to mail strangers in bulk. */
  readonly dailyMaxPerOrganization?: number;
  /** Called when the receipt could not be queued; the application is not affected. */
  readonly onError?: (error: unknown) => void;
}

/** What the delivery needs to put a fresh consent link into an import reconfirmation request at send time. */
export interface ReconfirmationDeps {
  readonly consentTokens: Pick<ConsentTokenRepository, 'rotate'>;
  /** A new secret from a CSPRNG (24+ chars). */
  readonly newSecret: () => string;
  /** sha256 of the secret as hex: what the token table stores. */
  readonly hash: (secret: string) => string;
}

export type DeliverDeps = Pick<
  MessagingDeps,
  'auditLog' | 'transaction' | 'organizations' | 'candidates' | 'applications' | 'settings' | 'conversations' | 'messages' | 'promises' | 'sender' | 'config' | 'newToken' | 'now'
> & {
  /** Absent: a reconfirmation request is recorded as failed (`consent_link_unavailable`), never sent without its link. */
  readonly reconfirmation?: ReconfirmationDeps | undefined;
};

export type InboundDeps = Pick<
  MessagingDeps,
  'auditLog' | 'transaction' | 'candidates' | 'applications' | 'conversations' | 'messages' | 'newId' | 'now'
>;
