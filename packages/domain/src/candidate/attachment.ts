import { z } from 'zod';
import { CV_MAX_BYTES } from './application.js';

/**
 * Files of an application other than its CV (a cover letter, a portfolio, a certificate). Today only a migration from
 * another ATS brings them (ADR 0009): the public form stays CV-only. They live under the application's storage prefix
 * and go with the application everywhere its CV goes (erasure, retention, undo of a migration, exports).
 */
export const ATTACHMENT_KINDS = ['cover_letter', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * What an attachment may be, decided from the content (magic bytes), never from the name: documents and still images.
 * Executables, archives, HTML, SVG and anything else are refused, so a stored file cannot run anything when opened.
 */
export const ATTACHMENT_MEDIA_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const;
export type AttachmentMediaType = (typeof ATTACHMENT_MEDIA_TYPES)[number];

export const isAttachmentMediaType = (value: string): value is AttachmentMediaType => (ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(value);

/** One file: the CV limit. */
export const ATTACHMENT_MAX_BYTES = CV_MAX_BYTES;
/** All the attachments of one application together (the CV not counted). */
export const ATTACHMENTS_PER_APPLICATION_MAX_BYTES = 5 * CV_MAX_BYTES;

/** Why a file of a migrated application was not stored: refused by type, over a size cap, or absent from the package. */
export const FILE_SKIP_REASONS = ['type', 'size', 'missing'] as const;
export type FileSkipReason = (typeof FILE_SKIP_REASONS)[number];

export interface ApplicationAttachment {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  /** The migration that brought it; null for none (not possible today, kept for other producers). */
  readonly migrationBatchId: string | null;
  readonly kind: AttachmentKind;
  /** A safe display and download name, extension matching the sniffed type. */
  readonly fileName: string;
  readonly mediaType: AttachmentMediaType;
  readonly sizeBytes: number;
  /** Storage key, always under the application's prefix (`attachmentKey`). */
  readonly key: string;
  readonly createdAt: Date;
}

/** The storage prefix of everything stored for one application (its CV and its attachments). */
export const applicationFilePrefix = (organizationId: string, applicationId: string): string => `organizations/${organizationId}/applications/${applicationId}/`;

export const attachmentKey = (organizationId: string, applicationId: string, attachmentId: string): string =>
  `${applicationFilePrefix(organizationId, applicationId)}attachments/${attachmentId}`;

/** Form answers of an application, as the source ATS had them: question and answer, plain text. */
export const ANSWER_QUESTION_MAX = 500;
export const ANSWER_TEXT_MAX = 5000;
export const ANSWERS_PER_APPLICATION_MAX = 100;
/** Stored size of all the answers of one application (JSON, UTF-8): also enforced by the database. */
export const ANSWERS_MAX_BYTES = 1024 * 1024;

export const applicationAnswerSchema = z.strictObject({
  question: z.string().trim().min(1).max(ANSWER_QUESTION_MAX),
  answer: z.string().trim().min(1).max(ANSWER_TEXT_MAX),
});
export type ApplicationAnswer = z.infer<typeof applicationAnswerSchema>;

export const applicationAnswersSchema = z.array(applicationAnswerSchema).max(ANSWERS_PER_APPLICATION_MAX);

/** UTF-8 length of a string (the package has no I/O libraries, so no TextEncoder). */
const utf8Length = (text: string): number => {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
};

const jsonBytes = (value: unknown): number => utf8Length(JSON.stringify(value));

/**
 * The answers to store: in order, as many as fit in `ANSWERS_MAX_BYTES`, and null when there are none (nothing to show
 * and nothing to keep). A new array: the input is not touched.
 */
export function cappedAnswers(answers: readonly ApplicationAnswer[]): readonly ApplicationAnswer[] | null {
  const kept: ApplicationAnswer[] = [];
  // JSON of an array is `[` + items joined by `,` + `]`: its size grows item by item, no need to re-serialize it all.
  let bytes = 2;
  for (const answer of answers.slice(0, ANSWERS_PER_APPLICATION_MAX)) {
    const item = { question: answer.question, answer: answer.answer };
    const next = bytes + jsonBytes(item) + (kept.length > 0 ? 1 : 0);
    if (next > ANSWERS_MAX_BYTES) break;
    kept.push(item);
    bytes = next;
  }
  return kept.length === 0 ? null : kept;
}
