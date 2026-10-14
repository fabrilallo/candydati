import { ValidationError } from '@tt/core';
import { careersMediaUploadFieldsSchema, MEDIA_LIMITS, type CareersMediaError } from '@tt/domain';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

const FIELD_MAX_BYTES = 2048;
/** Framing, the alt fields and slack on top of the largest file. */
export const CAREERS_MEDIA_BODY_LIMIT = MEDIA_LIMITS.videoMaxBytes + 1024 * 1024;

/** One byte over the largest file, so the use case (not the parser) names the exact limit of each kind: `too_large`. */
export const CAREERS_MEDIA_MULTIPART_LIMITS = {
  fileSize: MEDIA_LIMITS.videoMaxBytes + 1,
  fieldSize: FIELD_MAX_BYTES,
  files: 1,
  fields: 4,
  parts: 5,
  headerPairs: 20,
} as const;

const ALT_FIELDS = new Set(['alt.it', 'alt.en']);
const LIMIT_CODES = new Set(['FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_PARTS_LIMIT', 'FST_FIELDS_LIMIT']);

export interface CareersUpload {
  readonly bytes: Uint8Array;
  readonly alt: { readonly it?: string; readonly en?: string };
}

const refuse = (message: CareersMediaError | 'unexpected_part', path = 'file'): ValidationError => new ValidationError([{ path, message }]);
const isFile = (part: MultipartFile | MultipartValue): part is MultipartFile => part.type === 'file';
const hasCode = (error: unknown): boolean => LIMIT_CODES.has(String((error as { code?: unknown } | null)?.code));

/**
 * Exactly one `file` part and the optional text fields `alt.it` / `alt.en`; anything else is refused. The file is read into
 * memory (at most videoMaxBytes + 1: past that it is refused as `too_large`, never an error of the server). Nothing is
 * trusted: the type is decided from the content by the use case.
 */
export async function readCareersUpload(request: FastifyRequest): Promise<CareersUpload> {
  let bytes: Uint8Array | null = null;
  const alt: Record<string, string> = {};
  try {
    for await (const part of request.parts()) {
      if (isFile(part) && part.fieldname === 'file' && bytes === null) {
        bytes = new Uint8Array(await part.toBuffer());
      } else if (!isFile(part) && ALT_FIELDS.has(part.fieldname) && !(part.fieldname.slice(4) in alt)) {
        if (part.fieldnameTruncated || part.valueTruncated) throw refuse('too_large', part.fieldname);
        const value = typeof part.value === 'string' ? part.value.trim() : '';
        if (value !== '') alt[part.fieldname.slice(4)] = value;
      } else {
        throw refuse('unexpected_part');
      }
    }
  } catch (error) {
    if (hasCode(error)) throw refuse('too_large');
    throw error;
  }
  if (bytes === null) throw refuse('empty');
  const fields = careersMediaUploadFieldsSchema.safeParse({ alt });
  if (!fields.success) throw new ValidationError(fields.error.issues.map((issue) => ({ path: ['alt', ...issue.path].join('.'), message: issue.message })));
  return { bytes, alt: fields.data.alt };
}
