import { careersMediaKey, isMediaFileName, mediaFileName } from '@candydati/domain';
import { z } from 'zod';
import type { CareersMediaRecord, PublicCareersDeps } from '../../careers-ports.js';
import { NotFoundError } from '../../errors.js';
import type { StoredFileStream } from '../../intake-ports.js';

/** The file part of a media request: a name the asset produces and an optional byte range (video seeking). */
export const mediaFileInput = {
  mediaId: z.string().min(1).max(64),
  fileName: z.string().refine(isMediaFileName, 'file_name'),
  /** Inclusive byte range asked by the client (`Range: bytes=start-end`). */
  range: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative().nullable() }).nullable().default(null),
};

export interface CareersMediaFile {
  readonly mime: string;
  /** Size of the whole file; null when the storage does not say. */
  readonly sizeBytes: number | null;
  /** Inclusive; null when the whole file is sent. */
  readonly range: { readonly start: number; readonly end: number } | null;
  readonly body: StoredFileStream;
}

const RANGE_UNSATISFIABLE = 'range_not_satisfiable';

/** The part of a file of `size` bytes a range asks for; throws when it starts past the end. */
const clampRange = (range: { start: number; end: number | null }, size: number): { start: number; end: number } => {
  if (range.start >= size) throw Object.assign(new Error(RANGE_UNSATISFIABLE), { code: RANGE_UNSATISFIABLE, sizeBytes: size });
  return { start: range.start, end: Math.min(range.end ?? size - 1, size - 1) };
};

/** Names of the files an asset really has (content addressed: hash and width). */
export const fileNamesOf = (record: CareersMediaRecord): readonly string[] =>
  (record.kind === 'video' ? [null] : record.widths).map((width) => mediaFileName(record.sha256, record.mime, width));

/**
 * One stored file of an asset already found in its organization. The name must be one the asset has, so nothing else
 * under the organization's prefix can be read through it.
 */
export async function openMediaFile(
  deps: Pick<PublicCareersDeps, 'files'>,
  record: CareersMediaRecord | null,
  fileName: string,
  requested: { start: number; end: number | null } | null,
): Promise<CareersMediaFile> {
  if (!record || !fileNamesOf(record).includes(fileName)) throw new NotFoundError('Not found.');
  const key = careersMediaKey(record.organizationId, record.id, fileName);
  // A video is stored as uploaded: its size is the recorded one, and a range can be cut from it.
  if (record.kind === 'video' && requested !== null && deps.files.getRange) {
    const range = clampRange(requested, record.sizeBytes);
    return { mime: record.mime, sizeBytes: record.sizeBytes, range, body: await deps.files.getRange(key, range.start, range.end) };
  }
  const body = await deps.files.getStream(key);
  return { mime: record.mime, sizeBytes: body.sizeBytes ?? (record.kind === 'video' ? record.sizeBytes : null), range: null, body };
}

export const isRangeNotSatisfiable = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === RANGE_UNSATISFIABLE;

/** Size of the whole file a refused range was asked of (the 416 answer names it in `content-range`), or null. */
export const unsatisfiedRangeSize = (error: unknown): number | null => {
  const size = (error as { sizeBytes?: unknown } | null)?.sizeBytes;
  return isRangeNotSatisfiable(error) && typeof size === 'number' ? size : null;
};
