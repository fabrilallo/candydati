import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_APPLICATION_MAX_BYTES,
  CV_MAX_BYTES,
  attachmentKey,
  type ApplicationAttachment,
  type AttachmentKind,
  type FileSkipReason,
  type MigrationFile,
  type PlannedMigrationApplication,
  type StoredFile,
} from '@candydati/domain';
import type { MigrationCommitContext } from './commit-context.js';

/** Files skipped by reason; their sum is the batch's `filesSkipped`. */
export type SkippedFiles = Readonly<Record<FileSkipReason, number>>;

export const NO_SKIPPED: SkippedFiles = { type: 0, size: 0, missing: 0 };

/** What one application's files became: its CV, its attachments (already stored at their keys) and what was left out. */
export interface ApplicationFiles {
  readonly cv: StoredFile | null;
  readonly attachments: readonly ApplicationAttachment[];
  readonly skipped: SkippedFiles;
}

const cvKey = (organizationId: string, applicationId: string): string => `organizations/${organizationId}/applications/${applicationId}/cv`;

/** A CV that is not the CV (a second one, or one that is not a PDF or DOCX) is kept as an `other` attachment. */
const kindOf = (file: MigrationFile): AttachmentKind => (file.kind === 'cover_letter' ? 'cover_letter' : 'other');

const skip = (skipped: SkippedFiles, reason: FileSkipReason): SkippedFiles => ({ ...skipped, [reason]: skipped[reason] + 1 });

interface Progress {
  readonly cv: StoredFile | null;
  readonly attachments: readonly ApplicationAttachment[];
  readonly skipped: SkippedFiles;
  /** Bytes of the attachments kept so far (the CV not counted). */
  readonly bytes: number;
}

/** The CV, when this file is the first readable PDF or DOCX declared `cv`: stored at the key every CV has. */
async function asCv(ctx: MigrationCommitContext, applicationId: string, file: MigrationFile, bytes: Uint8Array): Promise<StoredFile | null> {
  if (file.kind !== 'cv' || bytes.byteLength > CV_MAX_BYTES) return null;
  const sniffed = ctx.deps.cvSniffer(bytes, file.fileName);
  if (!sniffed) return null;
  const key = cvKey(ctx.batch.organizationId, applicationId);
  await ctx.deps.files.put(key, bytes, sniffed.mediaType);
  return { key, fileName: sniffed.fileName, mediaType: sniffed.mediaType, sizeBytes: bytes.byteLength };
}

/** One file as an attachment, when its content is an allowed type and it fits in the caps. */
async function asAttachment(ctx: MigrationCommitContext, entry: PlannedMigrationApplication, file: MigrationFile, bytes: Uint8Array, progress: Progress): Promise<Progress> {
  const sniffed = ctx.deps.attachmentSniffer(bytes, file.fileName);
  if (!sniffed) return { ...progress, skipped: skip(progress.skipped, 'type') };
  if (progress.bytes + bytes.byteLength > ATTACHMENTS_PER_APPLICATION_MAX_BYTES) return { ...progress, skipped: skip(progress.skipped, 'size') };
  const { organizationId } = ctx.batch;
  const applicationId = ctx.rowId('application', entry.application.ref);
  const id = ctx.rowId('attachment', `${entry.application.ref}\u0000${file.path}`);
  const key = attachmentKey(organizationId, applicationId, id);
  await ctx.deps.files.put(key, bytes, sniffed.mediaType);
  const attachment: ApplicationAttachment = {
    id,
    organizationId,
    applicationId,
    migrationBatchId: ctx.batch.id,
    kind: kindOf(file),
    fileName: sniffed.fileName,
    mediaType: sniffed.mediaType,
    sizeBytes: bytes.byteLength,
    key,
    createdAt: new Date(entry.application.createdAt),
  };
  return { ...progress, attachments: [...progress.attachments, attachment], bytes: progress.bytes + bytes.byteLength };
}

async function oneFile(ctx: MigrationCommitContext, entry: PlannedMigrationApplication, file: MigrationFile, progress: Progress): Promise<Progress> {
  const stored = ctx.files.get(file.path);
  if (!stored) return { ...progress, skipped: skip(progress.skipped, 'missing') };
  // Sizes are checked before reading: a file larger than any cap is never held in memory.
  const cvSized = file.kind === 'cv' && progress.cv === null && stored.size <= CV_MAX_BYTES;
  if (!cvSized && stored.size > ATTACHMENT_MAX_BYTES) return { ...progress, skipped: skip(progress.skipped, 'size') };
  const bytes = await stored.read();
  const cv = progress.cv === null ? await asCv(ctx, ctx.rowId('application', entry.application.ref), file, bytes) : null;
  if (cv) return { ...progress, cv };
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) return { ...progress, skipped: skip(progress.skipped, 'size') };
  return asAttachment(ctx, entry, file, bytes, progress);
}

/**
 * Copies the files of one application to their final keys, one at a time, before its chunk's transaction (storage is
 * not transactional). The first readable PDF or DOCX declared `cv` is the CV; every other file is stored as an
 * attachment when its content is an allowed type and it fits, and is otherwise counted as skipped with its reason. The
 * keys are stable (from the batch and the package refs): a retry overwrites the same files.
 */
export async function copyApplicationFiles(ctx: MigrationCommitContext, entry: PlannedMigrationApplication): Promise<ApplicationFiles> {
  let progress: Progress = { cv: null, attachments: [], skipped: NO_SKIPPED, bytes: 0 };
  for (const file of entry.application.files) progress = await oneFile(ctx, entry, file, progress);
  return { cv: progress.cv, attachments: progress.attachments, skipped: progress.skipped };
}

export const addSkipped = (a: SkippedFiles, b: SkippedFiles): SkippedFiles => ({ type: a.type + b.type, size: a.size + b.size, missing: a.missing + b.missing });
