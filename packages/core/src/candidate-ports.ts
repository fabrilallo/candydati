import type { FeedbackStageEntryParts } from './feedback-ports.js';
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
import type { ResponsePromiseRepository, StageEventRepository } from './report-ports.js';

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
  /** Case-insensitive; the emails that match nobody are simply absent. */
  findByEmails(organizationId: string, emails: readonly string[]): Promise<readonly Candidate[]>;
}

/** What a guarded transition expects of the row: open, and in `stageId` when given. */
export interface ApplicationExpectation {
  readonly stageId?: string | undefined;
}

/** The columns a state change may write. */
export type ApplicationPatch = Partial<
  Pick<Application, 'stageId' | 'outcome' | 'stageChangedAt' | 'updatedAt' | 'closedAt' | 'responseDueAt' | 'respondedAt'>
>;

/** The columns a plain update may write: never stage or outcome. */
export type ApplicationDataPatch = Partial<Pick<Application, 'consent' | 'consentStatus' | 'retentionExpiresAt' | 'updatedAt' | 'reconfirmationSentAt'>>;

export interface ApplicationRepository {
  /** @throws ConflictError when the candidate already has an OPEN application for the same job. */
  create(application: Application): Promise<Application>;
  /**
   * State change of an OPEN application, column by column: only the fields in `patch` are written, and only while the
   * row is still open (and, with `expected.stageId`, still in that stage).
   * @throws ConflictError when another change got there first (decided, moved): nothing is written.
   */
  transition(organizationId: string, id: string, expected: ApplicationExpectation, patch: ApplicationPatch): Promise<Application>;
  /**
   * Column-targeted write that is not a state change (consent, retention): never touches stage or outcome.
   * @throws NotFoundError when the application does not exist.
   */
  update(organizationId: string, id: string, patch: ApplicationDataPatch): Promise<Application>;
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
  /**
   * Applications (open or decided) whose retention expires at or before `before`, ordered by `(retentionExpiresAt, id)`.
   * Without `page` the whole list comes back; with it, at most `limit` rows after the `after` cursor (keyset: pass the
   * last row of the previous batch).
   */
  listRetentionExpiringBefore(organizationId: string, before: Date, page?: RetentionPage): Promise<readonly Application[]>;
  /** Same, across every organization. Only for the retention job. */
  listRetentionExpiringAcrossOrganizations(before: Date, page?: RetentionPage): Promise<readonly Application[]>;
  /** Every application (open or decided) created by an import batch, newest first. */
  listByImportBatch(organizationId: string, batchId: string): Promise<readonly Application[]>;
  /** Applications stored at or after `since`, in the organization or, when `jobId` is given, for that job only. */
  countCreatedSince(organizationId: string, since: Date, jobId?: string): Promise<number>;
}

/** Keyset batch of the retention scan. */
export interface RetentionPage {
  readonly limit: number;
  readonly after?: { readonly retentionExpiresAt: Date; readonly id: string } | undefined;
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
  /** Extractions finished (`done` or `text_only`) at or after `since`: what the daily model budget counts. */
  countFinishedSince(organizationId: string, since: Date): Promise<number>;
}

/**
 * `search` lists only candidates who gave consent: imported ones waiting for reconfirmation (`to_renew`) never appear
 * here, and neither do their applications in the application count.
 */
export interface CandidateSearchQuery {
  readonly organizationId: string;
  /** Matches name, email, tags and CV text. Blank or absent: no text filter. */
  readonly query?: string | undefined;
  /** Exact, lowercase. */
  readonly tag?: string | undefined;
  readonly talentPool?: boolean | undefined;
  /** Only candidates with an application in these jobs, counting only those applications. Absent: no job filter. */
  readonly jobIds?: readonly string[] | undefined;
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
  /**
   * The candidates `search` would list (imported people who have not reconfirmed stay hidden), ordered by `id`, at most
   * `limit` of them with `id` greater than `afterId` (null: from the start). Keyset: stable while rows change.
   */
  listAfter(organizationId: string, afterId: string | null, limit: number): Promise<readonly Candidate[]>;
  /** Most recently applied first. */
  search(query: CandidateSearchQuery): Promise<{ readonly items: readonly CandidateSummary[]; readonly total: number }>;
}

/** Display names of the members of an organization. Ids that are not members are absent from the result. */
export interface UserDirectory {
  namesOf(organizationId: string, userIds: readonly string[]): Promise<Readonly<Record<string, string>>>;
  /**
   * Names for the actors shown in the organization's own records (audit log, keys, imports): its members, plus users who
   * acted in it and are no member (an invitee who declined, someone who left). Nobody else is ever named.
   */
  actorNamesOf(organizationId: string, userIds: readonly string[]): Promise<Readonly<Record<string, string>>>;
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
  /** Phase 9: when present, entering a stage asks its interviewers for feedback. A failure never undoes the move. */
  readonly feedback?: FeedbackStageEntryParts;
  /** `application.moved` and `application.decided` events for webhooks. */
  readonly outbox: OutboxRepository;
  /** Stage events and response promises, written when an application moves or is decided. */
  readonly stageEvents: StageEventRepository;
  readonly promises: ResponsePromiseRepository;
  readonly newId: () => string;
  readonly now: () => Date;
}
