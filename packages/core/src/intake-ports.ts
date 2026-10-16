import type { CvMediaType } from '@candydati/domain';
import type { ApplicationRepository, CandidateRepository, CvExtractionRepository, PrivacyNoticeRepository } from './candidate-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { ReceiptDeps } from './messaging-ports.js';
import type { AuditLogRepository, CoreDeps } from './ports.js';
import type { StageEventRepository, ResponsePromiseRepository } from './report-ports.js';
import type { OutboxRepository } from './webhook-ports.js';

/** A stored file read as a stream. `sizeBytes` is null when the backend does not say. */
export interface StoredFileStream {
  readonly stream: AsyncIterable<Uint8Array>;
  readonly sizeBytes: number | null;
}

/** Binary storage for CVs. Keys are chosen by core; `@candydati/providers` implements it (local disk, S3/MinIO). */
export interface FileStorage {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  /** Stores what `source` yields without holding it all in memory; returns the bytes written. Nothing is stored when `source` throws. */
  putStream(key: string, source: AsyncIterable<Uint8Array>, mediaType: string): Promise<number>;
  /** @throws when the key does not exist. */
  get(key: string): Promise<Uint8Array>;
  /** @throws when the key does not exist. `sizeBytes` is null when unknown. */
  getStream(key: string): Promise<{ readonly stream: AsyncIterable<Uint8Array>; readonly sizeBytes: number | null }>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  /**
   * Bytes `start` to `end` (inclusive) of a file, for video seeking. Optional: a storage without it serves whole files.
   * @throws when the key does not exist.
   */
  getRange?(key: string, start: number, end: number): Promise<StoredFileStream>;
}

export const TASK_NAMES = [
  'cv.extract',
  'email.send',
  'automation.run',
  'webhook.deliver',
  'deadlines.scan',
  'files.delete',
  'retention.run',
  'organization.export',
  'distribution.sync',
  'import.analyze',
  'import.commit',
  'migration.analyze',
] as const;
export type TaskName = (typeof TASK_NAMES)[number];

export interface CvExtractPayload {
  readonly organizationId: string;
  readonly applicationId: string;
}

export interface EmailSendPayload {
  readonly organizationId: string;
  readonly messageId: string;
}

/** Run the rules of `stageId` for an application that entered it. Checked again when it runs: the application may have moved on. */
export interface AutomationRunPayload {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly stageId: string;
}

/** One delivery of one event to one endpoint. */
export interface WebhookDeliverPayload {
  readonly organizationId: string;
  readonly eventId: string;
  readonly endpointId: string;
}

/** A stored file whose deletion failed after its row was erased: the worker retries until it is gone. */
export interface FilesDeletePayload {
  readonly organizationId: string;
  readonly key: string;
}

/** Build the ZIP of a `data_export` request. */
export interface OrganizationExportPayload {
  readonly organizationId: string;
  readonly exportId: string;
}

/** Sync every registered distribution channel of a job with its current state. */
export interface DistributionSyncPayload {
  readonly organizationId: string;
  readonly jobId: string;
}

/** Parse the uploaded files of an import batch and propose the candidates (`import.analyze`), or write them (`import.commit`). */
export interface ImportTaskPayload {
  readonly organizationId: string;
  readonly batchId: string;
}

export interface TaskPayloads {
  readonly 'cv.extract': CvExtractPayload;
  readonly 'email.send': EmailSendPayload;
  readonly 'automation.run': AutomationRunPayload;
  readonly 'webhook.deliver': WebhookDeliverPayload;
  /** Scheduled hourly; no payload. */
  readonly 'deadlines.scan': Readonly<Record<string, never>>;
  readonly 'files.delete': FilesDeletePayload;
  /** Scheduled daily at 03:00; no payload. */
  readonly 'retention.run': Readonly<Record<string, never>>;
  readonly 'organization.export': OrganizationExportPayload;
  readonly 'distribution.sync': DistributionSyncPayload;
  readonly 'import.analyze': ImportTaskPayload;
  readonly 'import.commit': ImportTaskPayload;
  /** Open, check and preview a migration package (ADR 0009). Ids only, like the import. */
  readonly 'migration.analyze': ImportTaskPayload;
}

/** A task as enqueued: the name decides the payload. */
export type QueuedTask = { readonly [N in TaskName]: { readonly name: N; readonly payload: TaskPayloads[N] } }[TaskName];

/** Background jobs (pg-boss in production). The payload carries ids only, never personal data. */
export interface EnqueueOptions {
  /**
   * At most one task per (name, key) is ever queued: a second enqueue with the same key is accepted and dropped. For
   * work that must not run twice (one commit per import batch, one delivery per message or per event and endpoint).
   */
  readonly singletonKey?: string | undefined;
  /**
   * With `singletonKey`: a task of that key that already ended `failed` (or `cancelled`) is removed first, so the work
   * is queued again instead of being dropped as a repeat. For the reconciler, which only asks for rows still waiting.
   */
  readonly replaceFailed?: boolean | undefined;
}

export interface TaskQueue {
  enqueue<N extends TaskName>(name: N, payload: TaskPayloads[N], options?: EnqueueOptions): Promise<void>;
}

/** Runs SQL text with `$1`-style placeholders. On a transaction's connection, what it writes commits or rolls back with it. */
export interface SqlExecutor {
  executeSql(text: string, values?: readonly unknown[]): Promise<{ readonly rows: unknown[] }>;
}

/**
 * A queue stored in the database itself (pg-boss): `bindTo` gives the same queue writing through `executor`. The unit of
 * work binds it to each transaction, so a task exists if and only if the transaction that queued it committed.
 */
export interface BindableTaskQueue extends TaskQueue {
  bindTo(executor: SqlExecutor): TaskQueue;
}

export interface SniffedCv {
  readonly mediaType: CvMediaType;
  /** A safe file name: no path, no control characters, extension matching the media type. */
  readonly fileName: string;
}

/** Decides from the magic bytes, never from the declared name alone. Null: not a PDF or DOCX. */
export type CvSniffer = (bytes: Uint8Array, declaredName: string) => SniffedCv | null;

export interface CvTextExtractor {
  /** Plain text of the document. May throw on a corrupt document: core marks the extraction `failed`. */
  extractText(bytes: Uint8Array, mediaType: CvMediaType): Promise<string>;
}

export interface CvModelExtractor {
  /** Structured data from the plain text. The result is validated by core with `cvExtractionSchema`. */
  extract(text: string): Promise<unknown>;
}

/** The repositories that take part in the single intake transaction. */
export interface IntakeRepositories {
  /** The job is share-locked and re-read inside the transaction: it cannot close while the application goes in. */
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly auditLog: AuditLogRepository;
  /** The `application.received` event is written in the same transaction as the application. */
  readonly outbox: OutboxRepository;
  /** The `received` stage event and the first promise are written in the same transaction as the application. */
  readonly stageEvents: StageEventRepository;
  readonly promises: ResponsePromiseRepository;
}

/** Runs `work` in ONE database transaction: if it throws, nothing it wrote remains. */
export interface ApplicationIntake {
  run<T>(work: (repositories: IntakeRepositories) => Promise<T>): Promise<T>;
}

/** Applications accepted per day: above either cap the public form answers 429. Counts stored applications. */
export interface ApplicationDailyCaps {
  readonly applications: Pick<ApplicationRepository, 'countCreatedSince'>;
  readonly perOrganization: number;
  readonly perJob: number;
}

export interface SubmitApplicationDeps {
  readonly organizations: OrganizationDirectory;
  readonly jobs: JobRepository;
  readonly privacyNotices: PrivacyNoticeRepository;
  readonly intake: ApplicationIntake;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  /** Phase 3: when present, a receipt email is queued after the application is stored. Its failure never fails the application. */
  readonly receipts?: ReceiptDeps;
  /** Absent: no cap (unit tests). The api always sets it. */
  readonly dailyCaps?: ApplicationDailyCaps;
  readonly cvSniffer: CvSniffer;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface CvExtractionDeps extends CoreDeps {
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly files: FileStorage;
  readonly textExtractor: CvTextExtractor;
  /** Null when no model is configured: only the plain text is extracted (`text_only`). */
  readonly modelExtractor: CvModelExtractor | null;
  /** Extractions per organization and day that may call the model; beyond it only the text is extracted. Absent: no cap. */
  readonly modelDailyBudget?: number;
  readonly now: () => Date;
}
