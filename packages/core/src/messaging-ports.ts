import type {
  DomainRecord,
  DomainStatus,
  EmailSettings,
  EmailTemplate,
  EmailTemplateKind,
  Locale,
  Message,
} from '@tt/domain';
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

export interface MessageRepository {
  /** @throws ConflictError when `inboundMessageId` already exists in the organization. */
  create(message: Message): Promise<Message>;
  /** Full replace by (organizationId, id). */
  save(message: Message): Promise<Message>;
  findById(organizationId: string, id: string): Promise<Message | null>;
  findByInboundMessageId(organizationId: string, inboundMessageId: string): Promise<Message | null>;
  /** Oldest first. */
  listByApplication(organizationId: string, applicationId: string): Promise<readonly Message[]>;
  /** Messages per application id; applications without messages are 0. */
  countByApplication(organizationId: string, applicationIds: readonly string[]): Promise<Readonly<Record<string, number>>>;
  /** Outbound messages to the candidate created at or after `since` (queued, sent or failed). */
  countOutboundSince(organizationId: string, candidateId: string, since: Date): Promise<number>;
}

export interface DomainCheck {
  readonly status: DomainStatus;
  /** DNS records to publish; empty when the provider has none to show. */
  readonly records: readonly DomainRecord[];
}

/** Sending-domain verification. Implemented by `@tt/providers` (SMTP answers `unsupported`). */
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
}

/**
 * Sends one email. A throw with `permanent: true` (rejected address, invalid sender) is not retried; any other throw
 * is transient and the worker retries it.
 */
export interface EmailSender {
  send(email: OutboundEmail): Promise<{ readonly providerMessageId: string }>;
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
  /** Called when the receipt could not be queued; the application is not affected. */
  readonly onError?: (error: unknown) => void;
}

export type DeliverDeps = Pick<
  MessagingDeps,
  'auditLog' | 'organizations' | 'candidates' | 'applications' | 'settings' | 'conversations' | 'messages' | 'promises' | 'sender' | 'config' | 'newToken' | 'now'
>;

export type InboundDeps = Pick<
  MessagingDeps,
  'auditLog' | 'candidates' | 'applications' | 'conversations' | 'messages' | 'newId' | 'now'
>;
