import type { ApplicationAttachment, Candidate, CandidateNote, Job, Message, StageEvent } from '@candydati/domain';
import type { MemberDirectory } from './automation-ports.js';
import type { ApplicationRepository, CandidateRepository, CvExtractionRepository, PrivacyNoticeRepository } from './candidate-ports.js';
import type { ConsentTokenRepository, ImportMailDeps } from './import-ports.js';
import type { AttachmentSniffer, CvSniffer } from './intake-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { MigrationDeps, MigrationPackageReader } from './migration-ports.js';
import type { ErasureDeps } from './privacy-ports.js';

/**
 * The rows a migration writes that the general repositories cannot tag with their batch (`migration_batch_id`), and
 * what its undo needs to find every row of the batch again. Every call is scoped to one organization; inside the
 * commit it runs in the chunk's transaction. Applications are written by `ApplicationRepository`, which carries the id.
 */
export interface MigratedRowsRepository {
  /** Inserts the job as it is (status, dates), with `origin 'migration'`: the publish rules are not applied. */
  insertJob(batchId: string, job: Job): Promise<void>;
  insertCandidate(batchId: string, candidate: Candidate): Promise<void>;
  /** Backfilled history: the rows say `backfilled: true` themselves. */
  insertStageEvents(batchId: string, events: readonly StageEvent[]): Promise<void>;
  insertNotes(batchId: string, notes: readonly CandidateNote[]): Promise<void>;
  /** Historical messages: never sent, never counted by the caps. */
  insertMessages(batchId: string, messages: readonly Message[]): Promise<void>;
  /** The attachments of migrated applications (their files are already stored at their keys). */
  insertAttachments(batchId: string, attachments: readonly ApplicationAttachment[]): Promise<void>;
  /** Every candidate the batch touched: created by it, or with an application, a note or a message of it. */
  candidateIdsOf(organizationId: string, batchId: string): Promise<readonly string[]>;
  /** Jobs the batch created. */
  jobIdsOf(organizationId: string, batchId: string): Promise<readonly string[]>;
  /** Deletes the notes, messages and stage events of the batch, except those about the `keep` candidates. Returns how many. */
  deleteHistory(organizationId: string, batchId: string, keep: readonly string[]): Promise<number>;
  /**
   * Deletes a job of the batch when nothing refers to it any more (no application, no setting made on it since) and it
   * is not published. False when it stays.
   */
  deleteJobIfUnused(organizationId: string, batchId: string, jobId: string): Promise<boolean>;
}

/** What the commit job (`migration.commit`) needs: the package, the repositories it writes to and the reconfirmation path. */
export interface MigrationCommitDeps extends MigrationDeps {
  readonly packages: MigrationPackageReader;
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly organizations: OrganizationDirectory;
  /** Note authors are matched to members by email. */
  readonly members: MemberDirectory;
  readonly migratedRows: MigratedRowsRepository;
  readonly consentTokens: ConsentTokenRepository;
  /** The reconfirmation request is a queued system message, like the import's. */
  readonly mail: ImportMailDeps;
  readonly cvSniffer: CvSniffer;
  /** Every other file of an application is stored only when its content is an allowed attachment type. */
  readonly attachmentSniffer: AttachmentSniffer;
  /** A new secret from a CSPRNG, for the consent token. */
  readonly newSecret: () => string;
  /** sha256 as hex: consent tokens, and the stable ids of migrated rows (the same package ref always gets the same id). */
  readonly hash: (value: string) => string;
}

/** The undo: erases through `eraseCandidateData`, then removes what the erasure does not reach. */
export interface MigrationUndoDeps extends MigrationDeps, ErasureDeps {
  readonly migratedRows: MigratedRowsRepository;
}

/** The daily purge of ended migrations. */
export type MigrationPurgeDeps = Pick<MigrationDeps, 'migrations' | 'migrationIssues' | 'files' | 'queue' | 'now'>;
