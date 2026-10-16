import { ValidationError, type FileStorage } from '@candydati/core';
import { importFileKey, IMPORT_LIMITS } from '@candydati/domain';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

export const FORM_FIELD_MAX_BYTES = 1024;
/** Framing, the two small fields and slack: the files themselves are bounded by `IMPORT_LIMITS.maxBytes` in total. */
export const IMPORT_BODY_LIMIT = IMPORT_LIMITS.maxBytes + 4 * 1024 * 1024;
/** A sheet or a CV is small; only an archive may use the whole batch budget. */
export const IMPORT_PLAIN_FILE_MAX_BYTES = 25 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** One file more than allowed would be silently dropped by the parser: the limit event makes it a refusal instead. */
export const IMPORT_MULTIPART_LIMITS = {
  fileSize: IMPORT_LIMITS.maxBytes,
  fieldSize: FORM_FIELD_MAX_BYTES,
  files: IMPORT_LIMITS.maxFiles,
  fields: 4,
  parts: IMPORT_LIMITS.maxFiles + 4,
  headerPairs: 20,
} as const;

export interface StoredImportFile {
  readonly fileName: string;
  readonly key: string;
  readonly sizeBytes: number;
}

export interface ImportUpload {
  readonly jobId: string;
  readonly stageId: string;
  /** The id the keys of `files` were made with; `createImportBatch` registers the batch under it. */
  readonly batchId: string;
  /** Already in storage: the upload is streamed there, never held in memory as a whole. */
  readonly files: readonly StoredImportFile[];
}

export interface ImportUploadTarget {
  readonly organizationId: string;
  readonly newId: () => string;
  readonly files: Pick<FileStorage, 'putStream' | 'delete'>;
}

const tooLarge = (what: string): Error => Object.assign(new Error(`${what} is too large.`), { statusCode: 413 });
const refuse = (path: string, message: string): ValidationError => new ValidationError([{ path, message }]);
const isFile = (part: MultipartFile | MultipartValue): part is MultipartFile => part.type === 'file';

const looksLikeZip = (chunk: Buffer): boolean => ZIP_MAGIC.every((value, index) => chunk[index] === value);

/**
 * The chunks of one file, refusing it once it passes its cap. The first bytes decide the cap (never the name): an archive
 * may use what is left of the batch, anything else is at most IMPORT_PLAIN_FILE_MAX_BYTES. Stops reading at the cap.
 */
async function* cappedChunks(part: MultipartFile, remaining: number): AsyncGenerator<Uint8Array> {
  let size = 0;
  let cap = remaining;
  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    if (size === 0) cap = looksLikeZip(chunk) ? remaining : Math.min(remaining, IMPORT_PLAIN_FILE_MAX_BYTES);
    size += chunk.byteLength;
    if (size > cap) {
      part.file.resume();
      throw tooLarge('The upload');
    }
    yield chunk;
  }
  if (part.file.truncated) throw tooLarge('The upload');
}

/**
 * Fields `jobId` and `stageId` once each, then any number of `files` parts, in total at most 200 MB and 1000 files. Anything
 * else is refused. Each file is streamed to storage as it arrives (multipart upload on S3), so the api holds a few MB, not
 * the batch. Nothing is trusted: the names are only labels, the use case and the worker sniff the content. When anything
 * is refused the files already stored are removed.
 */
export async function readImportParts(request: FastifyRequest, target: ImportUploadTarget): Promise<ImportUpload> {
  const batchId = target.newId();
  const fields = new Map<string, string>();
  const files: StoredImportFile[] = [];
  let remaining: number = IMPORT_LIMITS.maxBytes;
  try {
    for await (const part of request.parts()) {
      if (isFile(part) && part.fieldname === 'files') {
        const key = importFileKey(target.organizationId, batchId, `source/${files.length}`);
        const sizeBytes = await target.files.putStream(key, cappedChunks(part, remaining), 'application/octet-stream');
        files.push({ fileName: part.filename, key, sizeBytes });
        remaining -= sizeBytes;
      } else if (!isFile(part) && (part.fieldname === 'jobId' || part.fieldname === 'stageId') && !fields.has(part.fieldname)) {
        if (part.fieldnameTruncated || part.valueTruncated) throw tooLarge('The form data');
        fields.set(part.fieldname, typeof part.value === 'string' ? part.value : '');
      } else {
        throw refuse('form', 'unexpected_part');
      }
    }
  } catch (error) {
    await Promise.all(files.map((file) => target.files.delete(file.key).catch(() => undefined)));
    throw error;
  }
  return { jobId: fields.get('jobId') ?? '', stageId: fields.get('stageId') ?? '', batchId, files };
}
