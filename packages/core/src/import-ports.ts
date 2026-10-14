import type { ImportAnalysis, ImportBatch, ImportConfidence, ImportCounts, ImportItem, ImportItemStatus, ImportStatus } from '@tt/domain';
import type {
  ApplicationRepository,
  CandidateNoteRepository,
  CandidateRepository,
  CvExtractionRepository,
  PrivacyNoticeRepository,
} from './candidate-ports.js';
import type { FileStorage, CvSniffer, TaskQueue } from './intake-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { MessagingDeps } from './messaging-ports.js';
import type { StageEventRepository } from './report-ports.js';
import type { CoreDeps } from './ports.js';
import type { ErasureDeps } from './privacy-ports.js';

export interface ImportBatchRepository {
  create(batch: ImportBatch): Promise<ImportBatch>;
  /** Full replace by (organizationId, id), for edits that are not a status change (mapping, items, analysis results). */
  save(batch: ImportBatch): Promise<ImportBatch>;
  /**
   * Status change from `from` (compare-and-set), with the other fields in `patch`.
   * @throws ConflictError when the batch is not `from` any more: of two concurrent changes only one is written.
   */
  transition(organizationId: string, id: string, from: ImportStatus, patch: Partial<Omit<ImportBatch, 'id' | 'organizationId'>>): Promise<ImportBatch>;
  /** Adds `delta` to the stored counts in one statement: what a chunk of the commit wrote survives a crash of the next. */
  addCounts(organizationId: string, id: string, delta: Partial<Pick<ImportCounts, 'imported' | 'merged' | 'failed' | 'emailsQueued'>>): Promise<void>;
  findById(organizationId: string, id: string): Promise<ImportBatch | null>;
  /** Locks the batch row until the transaction ends (`FOR UPDATE`): two runs of the commit write one chunk at a time. */
  lock(organizationId: string, id: string): Promise<ImportBatch | null>;
  /** Newest first. */
  list(organizationId: string): Promise<readonly ImportBatch[]>;
  /**
   * Across organizations, for the retention sweep: batches created before `before` that are not committed
   * (`uploaded`, `analyzing`, `ready`, `importing`) or that still hold uploaded originals (an unfinished purge).
   */
  listStale(before: Date): Promise<readonly ImportBatch[]>;
}

export interface ImportItemQuery {
  readonly organizationId: string;
  readonly batchId: string;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
  readonly confidence?: ImportConfidence | undefined;
}

/** The proposed people of a batch. Personal data: deleted when the batch is done or undone. */
export interface ImportItemRepository {
  /** Replaces every item of the batch (re-matching starts from scratch). */
  replaceAll(organizationId: string, batchId: string, items: readonly ImportItem[]): Promise<void>;
  /** By position. */
  list(query: ImportItemQuery): Promise<{ readonly items: readonly ImportItem[]; readonly total: number }>;
  /** Every item of the batch, by position. */
  listAll(organizationId: string, batchId: string): Promise<readonly ImportItem[]>;
  /** Items not found in the batch are ignored. */
  setIncluded(organizationId: string, batchId: string, changes: readonly { readonly itemId: string; readonly included: boolean }[]): Promise<void>;
  /** From `pending` only: false when the item was already imported or failed (by another run of the commit). */
  setStatus(organizationId: string, itemId: string, status: ImportItemStatus, error: string | null): Promise<boolean>;
  /** Deletes the items of the batch. */
  deleteByBatch(organizationId: string, batchId: string): Promise<void>;
}

export interface ImportAnalysisRepository {
  /** Insert or replace by batch. */
  save(analysis: ImportAnalysis): Promise<void>;
  find(organizationId: string, batchId: string): Promise<ImportAnalysis | null>;
  delete(organizationId: string, batchId: string): Promise<void>;
}

/** Reconfirmation link of an imported application. Only the hash of the secret is stored. */
export interface ConsentToken {
  readonly tokenHash: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export interface ConsentTokenRepository {
  create(token: ConsentToken): Promise<ConsentToken>;
  /** By hash, across organizations: the secret is what says which organization it belongs to. */
  findByHash(tokenHash: string): Promise<ConsentToken | null>;
  /** Marks the token used; false when it was already used (single use, safe under concurrency). */
  markUsed(tokenHash: string, at: Date): Promise<boolean>;
}

/** What the recruiter-facing import use cases need. */
export interface ImportDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly imports: ImportBatchRepository;
  readonly importItems: ImportItemRepository;
  readonly importAnalyses: ImportAnalysisRepository;
  /** Originals of the batch live here, and are deleted from here once the batch is done or undone. */
  readonly files: FileStorage;
  /** `import.analyze` and `import.commit`, `files.delete` follow-ups. */
  readonly queue: TaskQueue;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** The repositories that take part in ONE chunk of a commit. */
export interface ImportCommitRepositories {
  /** To lock the target job (share) and refuse a closed one inside the chunk's transaction. */
  readonly jobs: JobRepository;
  readonly imports: ImportBatchRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly notes: CandidateNoteRepository;
  /** An imported application enters its stage at intake: the funnel counts it. */
  readonly stageEvents: StageEventRepository;
  readonly importItems: ImportItemRepository;
  readonly consentTokens: ConsentTokenRepository;
}

/** Runs `work` in ONE database transaction: if it throws, nothing it wrote remains. */
export interface ImportCommitTransaction {
  run<T>(work: (repositories: ImportCommitRepositories) => Promise<T>): Promise<T>;
}

/** What queuing the reconfirmation emails needs: the same path as every other system message. */
export type ImportMailDeps = Pick<MessagingDeps, 'conversations' | 'messages' | 'config' | 'newToken'>;

export interface ImportCommitDeps extends ImportDeps {
  readonly applications: ApplicationRepository;
  readonly commit: ImportCommitTransaction;
  readonly organizations: OrganizationDirectory;
  readonly cvSniffer: CvSniffer;
  readonly mail: ImportMailDeps;
  /** A new secret from a CSPRNG (24+ chars). Randomness lives in deps, never in core. */
  readonly newSecret: () => string;
  /** sha256 of the secret as hex. */
  readonly hash: (secret: string) => string;
  /** Called when a reconfirmation email could not be queued; the import is not affected. */
  readonly onMailError?: (error: unknown) => void;
}

export interface ImportUndoDeps extends ErasureDeps, ImportDeps {}

/** Public reconfirmation page. */
export interface ConsentDeps extends ErasureDeps, CoreDeps {
  readonly consentTokens: ConsentTokenRepository;
  readonly candidates: CandidateRepository;
  readonly jobs: JobRepository;
  readonly organizations: OrganizationDirectory;
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly hash: (secret: string) => string;
}
