import type { MigrationBatch, MigrationIssue, MigrationIssueLevel, MigrationPackage, MigrationStatus } from '@candydati/domain';
import type { CandidateRepository, PrivacyNoticeRepository } from './candidate-ports.js';
import type { CvSniffer, FileStorage, TaskQueue } from './intake-ports.js';
import type { CoreDeps } from './ports.js';

/** Fields a status change may write together with the new status. */
export type MigrationBatchPatch = Partial<Omit<MigrationBatch, 'id' | 'organizationId' | 'createdAt' | 'createdBy' | 'packageKey'>>;

/** Migration batches (ADR 0009). Every call is scoped to one organization. */
export interface MigrationBatchRepository {
  create(batch: MigrationBatch): Promise<MigrationBatch>;
  /**
   * Writes `patch` only while the batch is still `from` (compare-and-set). Edits in the preview pass `from: 'ready'` and
   * no status: an edit and the start of the commit can never both win.
   * @throws ConflictError when the batch is not `from` any more (or does not exist).
   */
  transition(organizationId: string, id: string, from: MigrationStatus, patch: MigrationBatchPatch): Promise<MigrationBatch>;
  findById(organizationId: string, id: string): Promise<MigrationBatch | null>;
  /** Locks the batch row until the transaction ends (`FOR UPDATE`): two runs of the commit write one chunk at a time. */
  lock(organizationId: string, id: string): Promise<MigrationBatch | null>;
  /** Newest first. */
  list(organizationId: string): Promise<readonly MigrationBatch[]>;
  /**
   * Across organizations, for the daily purge: batches `done`, `failed` or `undone`, last changed before `before`, whose
   * package and issues are not purged yet (`purgedAt` null). Oldest first, at most `limit`.
   */
  listToPurge(before: Date, limit: number): Promise<readonly MigrationBatch[]>;
}

export interface MigrationIssueQuery {
  readonly organizationId: string;
  readonly batchId: string;
  /** 1-based. */
  readonly page: number;
  readonly limit: number;
  readonly level?: MigrationIssueLevel | undefined;
}

/** Findings of the analysis. Ordered by level (errors first), then code, then ref. */
export interface MigrationIssueRepository {
  /** Replaces every issue of the batch (a new analysis starts from scratch). */
  replaceAll(organizationId: string, batchId: string, issues: readonly MigrationIssue[]): Promise<void>;
  list(query: MigrationIssueQuery): Promise<{ readonly items: readonly MigrationIssue[]; readonly total: number }>;
  deleteByBatch(organizationId: string, batchId: string): Promise<void>;
}

/** One file of an opened package: its declared size, and its bytes on demand (one file in memory at a time). */
export interface MigrationPackageEntry {
  readonly size: number;
  read(): Promise<Uint8Array>;
}

export interface OpenedMigrationPackageView {
  readonly manifest: MigrationPackage;
  /** Every referenced file, by its path in the package. */
  readonly files: ReadonlyMap<string, MigrationPackageEntry>;
  /** Files of the package that nothing references. */
  readonly unreferenced: readonly string[];
}

/** A refused package: `code` is stable and safe to show (`invalid_manifest`, `too_large`, ...); `details` are paths or schema issues. */
export type MigrationPackageOpenResult =
  | { readonly ok: true; readonly package: OpenedMigrationPackageView }
  | { readonly ok: false; readonly code: string; readonly details: readonly string[] };

/** Opens a stored package ZIP and checks it (safe archive, schema, references, files present). `@candydati/providers` implements it. */
export interface MigrationPackageReader {
  open(key: string): Promise<MigrationPackageOpenResult>;
}

/** What the operator-facing migration use cases need. */
export interface MigrationDeps extends CoreDeps {
  readonly migrations: MigrationBatchRepository;
  readonly migrationIssues: MigrationIssueRepository;
  /** The package ZIP lives here, under `organizations/{org}/migrations/{batchId}/`. */
  readonly files: FileStorage;
  /** `migration.analyze`, and `files.delete` follow-ups. */
  readonly queue: TaskQueue;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** The analysis job (`migration.analyze`): reads the package, looks up existing people and the active notice. */
export interface MigrationAnalysisDeps extends MigrationDeps {
  readonly candidates: CandidateRepository;
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly cvSniffer: CvSniffer;
  readonly packages: MigrationPackageReader;
}
