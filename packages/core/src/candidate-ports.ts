import type { FileStorage, TaskQueue } from './intake-ports.js';
import type { OutboxRepository } from './webhook-ports.js';
import type {
  Application,
  Candidate,
  CandidateNote,
  CvExtractionRecord,
  PrivacyNotice,
} from '@tt/domain';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { MessageRepository } from './messaging-ports.js';
import type { CoreDeps } from './ports.js';

/** Privacy notices are immutable: there is no update and no delete. */
export interface PrivacyNoticeRepository {
  /** @throws ConflictError when the version already exists in the organization. */
  create(notice: PrivacyNotice): Promise<PrivacyNotice>;
  /** The highest version, or null when the organization never published one. */
  findActive(organizationId: string): Promise<PrivacyNotice | null>;
  /** Newest version first. */
  list(organizationId: string): Promise<readonly PrivacyNotice[]>;
}

export interface CandidateRepository {
  /** @throws ConflictError when the email (case-insensitive) already exists in the organization. */
  create(candidate: Candidate): Promise<Candidate>;
  /**
   * Full replace by (organizationId, id).
   * @throws ConflictError when the new email (case-insensitive) belongs to another candidate of the organization.
   */
  save(candidate: Candidate): Promise<Candidate>;
  findById(organizationId: string, id: string): Promise<Candidate | null>;
  /** Case-insensitive. */
  findByEmail(organizationId: string, email: string): Promise<Candidate | null>;
  findByIds(organizationId: string, ids: readonly string[]): Promise<readonly Candidate[]>;
}

export interface ApplicationRepository {
  /** @throws ConflictError when the candidate already has an OPEN application for the same job. */
  create(application: Application): Promise<Application>;
  /** Full replace by (organizationId, id). */
  save(application: Application): Promise<Application>;
  findById(organizationId: string, id: string): Promise<Application | null>;
  /** The open application (outcome null) of the candidate for the job, if any. */
  findOpen(organizationId: string, jobId: string, candidateId: string): Promise<Application | null>;
  /** Open and decided, newest first. */
  listByJob(organizationId: string, jobId: string): Promise<readonly Application[]>;
  /** Newest first. */
  listByCandidate(organizationId: string, candidateId: string): Promise<readonly Application[]>;
  /** Open applications with a deadline (`responseDueAt` not null, not answered) at or before `dueBefore`, earliest deadline first. */
  listAwaitingResponse(organizationId: string, dueBefore: Date): Promise<readonly Application[]>;
  /** Same, across every organization. Only for the system scan: it groups the result by organization itself. */
  listAwaitingResponseAcrossOrganizations(dueBefore: Date): Promise<readonly Application[]>;
  /** Applications (open or decided) whose retention expires at or before `before`, earliest first. */
  listRetentionExpiringBefore(organizationId: string, before: Date): Promise<readonly Application[]>;
  /** Same, across every organization. Only for the retention job. */
  listRetentionExpiringAcrossOrganizations(before: Date): Promise<readonly Application[]>;
}

export interface CandidateNoteRepository {
  create(note: CandidateNote): Promise<CandidateNote>;
  /** Newest first. */
  listByCandidate(organizationId: string, candidateId: string): Promise<readonly CandidateNote[]>;
  /** Notes per application id; applications without notes are 0. */
  countByApplication(organizationId: string, applicationIds: readonly string[]): Promise<Readonly<Record<string, number>>>;
}

export interface CvExtractionRepository {
  /** Insert or replace by application id. */
  upsert(record: CvExtractionRecord): Promise<CvExtractionRecord>;
  findByApplication(organizationId: string, applicationId: string): Promise<CvExtractionRecord | null>;
  findByApplications(organizationId: string, applicationIds: readonly string[]): Promise<readonly CvExtractionRecord[]>;
}

export interface CandidateSearchQuery {
  readonly organizationId: string;
  /** Matches name, email, tags and CV text. Blank or absent: no text filter. */
  readonly query?: string | undefined;
  /** Exact, lowercase. */
  readonly tag?: string | undefined;
  readonly talentPool?: boolean | undefined;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
}

export interface CandidateSummary {
  readonly candidate: Candidate;
  readonly applicationCount: number;
  readonly lastAppliedAt: Date | null;
}

export interface CandidateSearch {
  /** Most recently applied first. */
  search(query: CandidateSearchQuery): Promise<{ readonly items: readonly CandidateSummary[]; readonly total: number }>;
}

/** Display names of the members of an organization. Ids that are not members are absent from the result. */
export interface UserDirectory {
  namesOf(organizationId: string, userIds: readonly string[]): Promise<Readonly<Record<string, string>>>;
}

export interface PrivacyDeps extends CoreDeps {
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly organizations: OrganizationDirectory;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** Everything the recruiter-facing candidate use cases need. */
export interface CandidateDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly notes: CandidateNoteRepository;
  readonly extractions: CvExtractionRepository;
  readonly messages: MessageRepository;
  readonly candidateSearch: CandidateSearch;
  readonly users: UserDirectory;
  readonly files: FileStorage;
  /** `automation.run` is enqueued after a move. A failure to enqueue never undoes the move. */
  readonly queue: TaskQueue;
  /** `application.moved` and `application.decided` events for webhooks. */
  readonly outbox: OutboxRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}
