import { ValidationError } from '@tt/core';
import { IMPORT_LIMITS } from '@tt/domain';
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

export interface ImportUpload {
  readonly jobId: string;
  readonly stageId: string;
  readonly files: readonly { readonly fileName: string; readonly bytes: Uint8Array }[];
}

const tooLarge = (what: string): Error => Object.assign(new Error(`${what} is too large.`), { statusCode: 413 });
const refuse = (path: string, message: string): ValidationError => new ValidationError([{ path, message }]);
const isFile = (part: MultipartFile | MultipartValue): part is MultipartFile => part.type === 'file';

const looksLikeZip = (chunk: Buffer): boolean => ZIP_MAGIC.every((value, index) => chunk[index] === value);

/**
 * Reads one file into memory within the budget left for the batch. The first bytes decide the cap (never the name): an
 * archive may use what is left of the batch, anything else is at most IMPORT_PLAIN_FILE_MAX_BYTES. Stops reading at the cap.
 */
async function readCapped(part: MultipartFile, remaining: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  let cap = remaining;
  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    if (size === 0) cap = looksLikeZip(chunk) ? remaining : Math.min(remaining, IMPORT_PLAIN_FILE_MAX_BYTES);
    size += chunk.byteLength;
    if (size > cap) {
      part.file.resume();
      throw tooLarge('The upload');
    }
    chunks.push(chunk);
  }
  if (part.file.truncated) throw tooLarge('The upload');
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Fields `jobId` and `stageId` once each, then any number of `files` parts, in total at most 200 MB and 1000 files. Anything
 * else is refused. Nothing is trusted: the names are only labels, the use case and the worker sniff the content.
 */
export async function readImportParts(request: FastifyRequest): Promise<ImportUpload> {
  const fields = new Map<string, string>();
  const files: { fileName: string; bytes: Uint8Array }[] = [];
  let remaining: number = IMPORT_LIMITS.maxBytes;
  for await (const part of request.parts()) {
    if (isFile(part) && part.fieldname === 'files') {
      const bytes = await readCapped(part, remaining);
      remaining -= bytes.byteLength;
      files.push({ fileName: part.filename, bytes });
    } else if (!isFile(part) && (part.fieldname === 'jobId' || part.fieldname === 'stageId') && !fields.has(part.fieldname)) {
      if (part.fieldnameTruncated || part.valueTruncated) throw tooLarge('The form data');
      fields.set(part.fieldname, typeof part.value === 'string' ? part.value : '');
    } else {
      throw refuse('form', 'unexpected_part');
    }
  }
  return { jobId: fields.get('jobId') ?? '', stageId: fields.get('stageId') ?? '', files };
}
