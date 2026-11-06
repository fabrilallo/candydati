import type { Candidate, SourcedContact } from '@candydati/domain';
import type { CoreDeps } from './ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { EmailSender, MessagingConfig } from './messaging-ports.js';
import type { TaskQueue } from './intake-ports.js';
import type { OrganizationSettingsRepository } from './job-request-ports.js';

/** Contacts found by sourcing. Every method takes the organization, except the two the public link and the system job need. */
export interface SourcedContactRepository {
  create(contact: SourcedContact): Promise<SourcedContact>;
  findById(organizationId: string, id: string): Promise<SourcedContact | null>;
  /** Newest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly SourcedContact[]>;
  /** The contacts of any job of the organization with these profile keys or emails. */
  findMatching(organizationId: string, match: { readonly profileKeys: readonly string[]; readonly emails: readonly string[] }): Promise<readonly SourcedContact[]>;
  /** Partial update of status, notice and contact dates, and the notice hash. */
  update(organizationId: string, id: string, patch: Partial<Pick<SourcedContact, 'status' | 'noticeTokenHash' | 'noticeSentAt' | 'contactedAt'>>): Promise<SourcedContact | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
  /** The public notice page: the secret's hash is the only key. Across organizations. */
  findByNoticeHash(tokenHash: string): Promise<SourcedContact | null>;
  /** Erases every contact past `expiresAt`, across organizations. Returns how many. Only for the system job. */
  deleteExpired(now: Date): Promise<number>;
}

/** Keyed hashes of the people who objected: never the value itself. */
export interface SourcingObjectionRepository {
  /** The fingerprints among these that an objection holds. */
  existing(organizationId: string, fingerprints: readonly string[]): Promise<ReadonlySet<string>>;
  add(organizationId: string, fingerprints: readonly string[], at: Date): Promise<void>;
}

/** Candidates of the organization that are the same person: same email, or a LinkedIn link with the same profile key. */
export interface SourcingCandidateLookup {
  findMatching(organizationId: string, match: { readonly profileKeys: readonly string[]; readonly emails: readonly string[] }): Promise<readonly Pick<Candidate, 'id' | 'email' | 'linkedinUrl'>[]>;
}

/** The art. 14 email, from the organization's sender identity (like every message to a person). */
export interface SourcingMailParts {
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly organizations: OrganizationDirectory;
  /** Called when a notice could not be sent: the contact stays `found` and the notice can be sent again. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface SourcingDeps extends CoreDeps, SourcingMailParts {
  readonly jobs: JobRepository;
  readonly contacts: SourcedContactRepository;
  readonly objections: SourcingObjectionRepository;
  readonly existingCandidates: SourcingCandidateLookup;
  /** Whether the organization emails the notice at once to contacts with a known address (off by default). */
  readonly organizationSettings: OrganizationSettingsRepository;
  /** `sourcing.notice`: the email goes out from the worker, after the contact is committed. */
  readonly queue: TaskQueue;
  /** 24+ chars from a CSPRNG: the secret in the notice link. */
  readonly newToken: () => string;
  /** One-way hash of a secret (sha256 hex). */
  readonly hash: (secret: string) => string;
  /** Keyed hash (HMAC with the instance secret and the organization) of a profile key or an email, for objections. */
  readonly fingerprint: (organizationId: string, value: string) => string;
  readonly newId: () => string;
  readonly now: () => Date;
  /** Absent: sourcing from GitHub is not available on this instance. */
  readonly github?: GithubPeopleSearch | undefined;
}

/** A public GitHub account, as the API gives it. Never more: no email, no followers (popularity is not a criterion). */
export interface GithubPerson {
  readonly login: string;
  readonly name: string | null;
  readonly location: string | null;
  readonly bio: string | null;
  readonly profileUrl: string;
  readonly publicRepos: number;
  /** Languages of the person's own public repositories (forks left out), most repositories first. */
  readonly languages: readonly { readonly language: string; readonly repos: number }[];
}

export interface GithubQuery {
  readonly languages: readonly string[];
  readonly location: string | null;
  /** Words that must appear in the bio. */
  readonly keywords: readonly string[];
  readonly limit: number;
}

/** GitHub's public user search (official API). Ordered by join date, newest first: never by any notion of "best". */
export interface GithubPeopleSearch {
  search(query: GithubQuery): Promise<readonly GithubPerson[]>;
}
