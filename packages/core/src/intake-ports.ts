import type { CvMediaType } from '@tt/domain';
import type { ApplicationRepository, CandidateRepository, CvExtractionRepository, PrivacyNoticeRepository } from './candidate-ports.js';
import type { JobRepository, OrganizationDirectory } from './job-ports.js';
import type { ReceiptDeps } from './messaging-ports.js';
import type { AuditLogRepository } from './ports.js';

/** Binary storage for CVs. Keys are chosen by core; `@tt/providers` implements it (local disk, S3/MinIO). */
export interface FileStorage {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  /** @throws when the key does not exist. */
  get(key: string): Promise<Uint8Array>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

export const TASK_NAMES = ['cv.extract', 'email.send'] as const;
export type TaskName = (typeof TASK_NAMES)[number];

export interface CvExtractPayload {
  readonly organizationId: string;
  readonly applicationId: string;
}

export interface EmailSendPayload {
  readonly organizationId: string;
  readonly messageId: string;
}

export interface TaskPayloads {
  readonly 'cv.extract': CvExtractPayload;
  readonly 'email.send': EmailSendPayload;
}

/** A task as enqueued: the name decides the payload. */
export type QueuedTask = { readonly [N in TaskName]: { readonly name: N; readonly payload: TaskPayloads[N] } }[TaskName];

/** Background jobs (pg-boss in production). The payload carries ids only, never personal data. */
export interface TaskQueue {
  enqueue<N extends TaskName>(name: N, payload: TaskPayloads[N]): Promise<void>;
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
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly auditLog: AuditLogRepository;
}

/** Runs `work` in ONE database transaction: if it throws, nothing it wrote remains. */
export interface ApplicationIntake {
  run<T>(work: (repositories: IntakeRepositories) => Promise<T>): Promise<T>;
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
  readonly cvSniffer: CvSniffer;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface CvExtractionDeps {
  readonly auditLog: AuditLogRepository;
  readonly applications: ApplicationRepository;
  readonly extractions: CvExtractionRepository;
  readonly files: FileStorage;
  readonly textExtractor: CvTextExtractor;
  /** Null when no model is configured: only the plain text is extracted (`text_only`). */
  readonly modelExtractor: CvModelExtractor | null;
  readonly now: () => Date;
}
