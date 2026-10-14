import type { JobTeamRepository } from './job-team-ports.js';
import type { ConsentStatus, DataExport, RetentionRun } from '@tt/domain';
import type { ApplicationRepository, CandidateRepository, CandidateSearch, CandidateNoteRepository, CvExtractionRepository, PrivacyNoticeRepository } from './candidate-ports.js';
import type { NotificationRepository, MemberDirectory } from './automation-ports.js';
import type { FeedbackRecords } from './feedback-ports.js';
import type { FileStorage, TaskQueue } from './intake-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { MessageRepository } from './messaging-ports.js';
import type { AuditLogRepository, CoreDeps } from './ports.js';
import type { OutboxRepository } from './webhook-ports.js';

/**
 * Removes everything stored about applications and candidates (PRODUCT.md §6). One implementation per storage; the Postgres one
 * runs inside the transaction `ErasureTransaction.run` opens, so a failure leaves nothing half deleted.
 */
/** An application as the erasure sees it once locked: what decides whether it still has to go. */
export interface ErasableApplication {
  readonly id: string;
  readonly retentionExpiresAt: Date;
  readonly consentStatus: ConsentStatus;
  /** When the reconfirmation email went out (imported data); null: never. */
  readonly reconfirmationSentAt: Date | null;
  /** A consent token exists: the person has an address and can be asked to reconfirm. */
  readonly canBeAsked: boolean;
}

export interface ErasureStore {
  /**
   * Locks the candidate row and every application of theirs (`FOR UPDATE`) until the erasure commits, and returns the
   * applications as they are now: a reconfirmation, a new application or a second erasure waits for this one.
   */
  lockCandidateApplications(organizationId: string, candidateId: string): Promise<readonly ErasableApplication[]>;
  /**
   * Deletes, for the given applications: notifications, tasks, outbox events and webhook deliveries that point to them,
   * messages, conversations, CV extractions, stage events and response promises, notes about them, interview feedback and its requests and finally the applications. Returns their CV file keys.
   */
  deleteApplications(organizationId: string, applicationIds: readonly string[]): Promise<readonly string[]>;
  /**
   * Deletes the candidate row, the notes about the candidate and the outbox events and deliveries that mention the
   * candidate id. Only call it when no application of the candidate remains.
   */
  deleteCandidate(organizationId: string, candidateId: string): Promise<void>;
  /**
   * Deletes the organization's data exports (the rows; the ZIP files are returned as keys to delete after the commit).
   * A generated export is a copy of everyone, the erased person included, so none may outlive an erasure: a new one is
   * generated on demand.
   */
  deleteDataExports(organizationId: string): Promise<readonly string[]>;
}

export interface ErasureRepositories {
  readonly store: ErasureStore;
  readonly auditLog: AuditLogRepository;
  /** The `candidate.erased` event is written in the same transaction as the erasure. */
  readonly outbox: OutboxRepository;
}

/** Runs `work` in ONE database transaction: if it throws, nothing it deleted or wrote remains. */
export interface ErasureTransaction {
  run<T>(work: (repositories: ErasureRepositories) => Promise<T>): Promise<T>;
}

/** What `eraseCandidateData` needs. */
export interface ErasureDeps {
  readonly applications: ApplicationRepository;
  readonly erasure: ErasureTransaction;
  readonly files: FileStorage;
  /** `files.delete` follow-up for keys whose deletion failed. */
  readonly queue: TaskQueue;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface RetentionRunRepository {
  create(run: RetentionRun): Promise<RetentionRun>;
  /** Newest first. */
  listRecent(organizationId: string, limit: number): Promise<readonly RetentionRun[]>;
}

export interface DataExportRepository {
  create(dataExport: DataExport): Promise<DataExport>;
  /** Full replace by (organizationId, id). */
  save(dataExport: DataExport): Promise<DataExport>;
  findById(organizationId: string, id: string): Promise<DataExport | null>;
  /** Newest first. */
  list(organizationId: string): Promise<readonly DataExport[]>;
  /** Past `expiresAt`, across organizations. Only for the retention job. */
  listExpiredAcrossOrganizations(now: Date): Promise<readonly DataExport[]>;
  /** True when a row was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
}

/** Builds a ZIP archive. Implemented by the api and worker (a streaming library); core only describes entries. */
export interface ZipWriter {
  /** Adds a file. `path` uses `/` and never starts with one. */
  add(path: string, bytes: Uint8Array): Promise<void>;
  /** Closes the archive and returns it. The writer cannot be used afterwards. */
  finish(): Promise<Uint8Array>;
}

export type ZipWriterFactory = () => ZipWriter;

/**
 * Builds a ZIP as a stream, for archives too big to hold in memory. Read `output` while adding (for instance by
 * handing it to `FileStorage.putStream`): `add` waits when the reader is slow, so memory stays bounded.
 */
export interface ZipStream {
  /** Adds a file after the previous one. `path` uses `/` and never starts with one. */
  add(path: string, bytes: Uint8Array): Promise<void>;
  /** Closes the archive: `output` ends after the last chunk. */
  finish(): Promise<unknown>;
  /** Gives up: `output` fails with `error` and pending `add` calls reject. */
  abort(error: Error): void;
  /** The archive bytes in order. Iterate once. */
  readonly output: AsyncIterable<Uint8Array>;
}

export type ZipStreamFactory = () => ZipStream;

/** Providers the instance is configured with, for the record of processing activities (GDPR art. 30). Names only, never credentials. */
export interface ConfiguredProviders {
  /** `local` or `s3`, with the host when relevant. */
  readonly storage: string;
  /** `smtp`, `resend`, ... */
  readonly email: string;
  /** `provider/model` string of `AGENT_MODEL`, or null when no model is configured. */
  readonly model: string | null;
}

/** Everything the candidate-rights use cases need on top of the candidate world. */
export interface CandidateRightsDeps extends CoreDeps, ErasureDeps, FeedbackRecords {
  readonly candidates: CandidateRepository;
  readonly notes: CandidateNoteRepository;
  readonly extractions: CvExtractionRepository;
  readonly messages: MessageRepository;
  readonly jobs: JobRepository;
  readonly privacyNotices: PrivacyNoticeRepository;
}

export interface OrganizationExportDeps extends CoreDeps, FeedbackRecords {
  readonly dataExports: DataExportRepository;
  readonly organizations: OrganizationDirectory;
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly candidateSearch: CandidateSearch;
  readonly applications: ApplicationRepository;
  readonly notes: CandidateNoteRepository;
  readonly extractions: CvExtractionRepository;
  readonly messages: MessageRepository;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly zip: ZipStreamFactory;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface RetentionDeps extends ErasureDeps {
  readonly jobs: JobRepository;
  readonly notifications: NotificationRepository;
  readonly members: MemberDirectory;
  /** Job teams: a retention digest names only jobs its reader can still reach. */
  readonly jobTeams: JobTeamRepository;
  readonly retentionRuns: RetentionRunRepository;
  readonly dataExports: DataExportRepository;
}

export interface PrivacyOverviewDeps extends CoreDeps {
  readonly applications: ApplicationRepository;
  readonly candidates: CandidateRepository;
  readonly jobs: JobRepository;
  readonly organizations: OrganizationDirectory;
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly retentionRuns: RetentionRunRepository;
  readonly providers: ConfiguredProviders;
  readonly now: () => Date;
}
