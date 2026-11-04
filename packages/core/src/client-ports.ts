import type { Client, ClientAnswer, ClientShortlist, ClientShortlistItem, JobClientLink, PublicJobClientDto } from '@candydati/domain';
import type { ApplicationRepository, CandidateNoteRepository, CandidateRepository } from './candidate-ports.js';
import type { FileStorage, TaskQueue } from './intake-ports.js';
import type { OrganizationSettingsRepository } from './job-request-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { ConversationRepository, EmailSender, MessageRepository, MessagingConfig } from './messaging-ports.js';
import type { CoreDeps } from './ports.js';

/** Clients of an agency (PRODUCT.md §3.5). Every method takes the organization. */
export interface ClientRepository {
  /** By name, case-insensitive. Archived clients only when asked. */
  list(organizationId: string, options: { readonly includeArchived: boolean }): Promise<readonly Client[]>;
  findById(organizationId: string, id: string): Promise<Client | null>;
  /** @throws ConflictError when the organization already has a client with this name (case-insensitive). */
  create(client: Client): Promise<Client>;
  /** Null when there is no such client. @throws ConflictError on a duplicate name. */
  update(organizationId: string, id: string, patch: Pick<Client, 'name' | 'website' | 'logoUrl' | 'contacts' | 'updatedAt'>): Promise<Client | null>;
  setArchived(organizationId: string, id: string, archivedAt: Date | null, updatedAt: Date): Promise<Client | null>;
}

/** The client of each job. Every method takes the organization. */
export interface JobClientRepository {
  findByJob(organizationId: string, jobId: string): Promise<JobClientLink | null>;
  listByJobs(organizationId: string, jobIds: readonly string[]): Promise<readonly JobClientLink[]>;
  listJobIdsByClient(organizationId: string, clientId: string): Promise<readonly string[]>;
  /** Jobs per client id; clients without jobs are absent. */
  countByClient(organizationId: string): Promise<Readonly<Record<string, number>>>;
  /** Insert or replace the link of `link.jobId`. */
  set(link: JobClientLink): Promise<void>;
  remove(organizationId: string, jobId: string): Promise<void>;
}

/**
 * What the public pages show about the client of published jobs, keyed by job id (jobs without a client are absent):
 * the client's public face (or nothing, when confidential) and the agency's authorization reference.
 */
export interface PublicJobClientDirectory {
  forJobs(organizationId: string, jobIds: readonly string[]): Promise<Readonly<Record<string, PublicJobClientDto>>>;
}

export type ShortlistTokenPatch = Pick<ClientShortlist, 'tokenHash' | 'remindersSent' | 'lastReminderAt'>;

export interface ShortlistAnswerWrite {
  readonly answer: ClientAnswer;
  readonly reason: string;
  readonly at: Date;
}

/** Shortlists and their candidates. Every method takes the organization, except the lookup by the hash of a secret. */
export interface ShortlistRepository {
  /** The shortlist and its items in one go. @throws ConflictError when the token hash is taken. */
  create(shortlist: ClientShortlist, items: readonly ClientShortlistItem[]): Promise<void>;
  findById(organizationId: string, id: string): Promise<ClientShortlist | null>;
  /** By the hash of the secret, across organizations: the secret is what says which organization the link belongs to. */
  findByTokenHash(tokenHash: string): Promise<ClientShortlist | null>;
  /** Newest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly ClientShortlist[]>;
  /** Ordered by shortlist, then position. */
  listItems(organizationId: string, shortlistIds: readonly string[]): Promise<readonly ClientShortlistItem[]>;
  /** Every item of an application, oldest shortlist first: the timeline, the export and the erasure read it. */
  listItemsByApplication(organizationId: string, applicationId: string): Promise<readonly ClientShortlistItem[]>;
  /** False when it was already revoked. */
  revoke(organizationId: string, id: string, at: Date): Promise<boolean>;
  /** Stores the first opening only; false when it was opened before. */
  markOpened(organizationId: string, id: string, at: Date): Promise<boolean>;
  /** One answer per candidate: written only while the item has none. False otherwise; nothing is written. */
  answer(organizationId: string, shortlistId: string, itemId: string, answer: ShortlistAnswerWrite): Promise<boolean>;
  markCandidateNotified(organizationId: string, itemIds: readonly string[], at: Date): Promise<void>;
  /** A reminder's new link, written only while the shortlist still has `expectedTokenHash`. Null otherwise. */
  rotateToken(organizationId: string, id: string, expectedTokenHash: string, patch: ShortlistTokenPatch): Promise<ClientShortlist | null>;
  /** Not revoked and not expired at `now`, across organizations. Only for the reminder scan. */
  listOpenAcrossOrganizations(now: Date): Promise<readonly ClientShortlist[]>;
  /** Erasure of an application: its items go (the shortlist stays for the others). */
  deleteItemsOfApplications(organizationId: string, applicationIds: readonly string[]): Promise<void>;
}

/** Clients, the job link and the agency setting. */
export interface ClientDeps extends CoreDeps {
  readonly clients: ClientRepository;
  readonly jobClients: JobClientRepository;
  readonly jobs: JobRepository;
  readonly organizationSettings: OrganizationSettingsRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** What sending links needs. The client email goes out from the platform identity. */
export interface ShortlistMailParts {
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  /** 24+ chars, base32 lowercase, from a CSPRNG: the secret in the link. */
  readonly newToken: () => string;
  /** One-way hash of the secret (sha256 hex). Only the hash is stored. */
  readonly hash: (secret: string) => string;
  /** Called when an email could not be sent; the shortlist exists either way. */
  readonly onError?: (error: unknown) => void;
}

export interface ShortlistDeps extends ClientDeps, ShortlistMailParts {
  readonly shortlists: ShortlistRepository;
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly notes: CandidateNoteRepository;
  readonly organizations: OrganizationDirectory;
  /** The notice to the candidate goes through their conversation, like every message, and shows on the timeline. */
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly queue: TaskQueue;
  /** The CV, when the recruiter shared it. */
  readonly files: FileStorage;
}

/** The public shortlist page: a visitor with a link, no session. */
export type PublicShortlistDeps = Pick<
  ShortlistDeps,
  'auditLog' | 'transaction' | 'jobTeams' | 'shortlists' | 'clients' | 'jobs' | 'applications' | 'candidates' | 'notes' | 'organizations' | 'files' | 'hash' | 'now'
>;
