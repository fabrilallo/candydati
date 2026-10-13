import { ValidationError } from '@tt/core';
import { CV_MAX_BYTES } from '@tt/domain';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

export const FORM_FIELD_MAX_BYTES = 16 * 1024;
/** The CV plus the JSON `data` field, with room for the multipart framing. */
export const APPLICATION_BODY_LIMIT = CV_MAX_BYTES + 64 * 1024;
/** One more than allowed, so an extra part is seen and refused instead of silently cut. */
export const MULTIPART_LIMITS = {
  fileSize: CV_MAX_BYTES,
  fieldSize: FORM_FIELD_MAX_BYTES,
  files: 2,
  fields: 2,
  parts: 3,
  headerPairs: 20,
} as const;

export interface ApplicationParts {
  readonly form: Readonly<Record<string, unknown>>;
  readonly cv: { readonly bytes: Uint8Array; readonly declaredName: string };
}

const refuse = (path: string, message: string): ValidationError => new ValidationError([{ path, message }]);
const tooLarge = (what: string): Error => Object.assign(new Error(`${what} is too large.`), { statusCode: 413 });

function parseForm(raw: string): Readonly<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // reported below as one validation issue, whatever the parser said
  }
  throw refuse('data', 'invalid_json');
}

const isFile = (part: MultipartFile | MultipartValue): part is MultipartFile => part.type === 'file';

/**
 * Exactly two parts: the JSON field `data` and the file `cv`, each once. Anything else is refused. The file is
 * read into memory (at most CV_MAX_BYTES) because core needs its bytes to sniff and store it.
 */
export async function readApplicationParts(request: FastifyRequest): Promise<ApplicationParts> {
  let data: string | null = null;
  let cv: ApplicationParts['cv'] | null = null;
  for await (const part of request.parts()) {
    if (isFile(part) && part.fieldname === 'cv' && cv === null) {
      cv = { bytes: new Uint8Array(await part.toBuffer()), declaredName: part.filename };
    } else if (!isFile(part) && part.fieldname === 'data' && data === null) {
      if (part.fieldnameTruncated || part.valueTruncated) throw tooLarge('The form data');
      data = typeof part.value === 'string' ? part.value : JSON.stringify(part.value);
    } else {
      throw refuse('form', 'unexpected_part');
    }
  }
  if (data === null) throw refuse('data', 'data_required');
  if (cv === null) throw refuse('cv', 'cv_required');
  return { form: parseForm(data), cv };
}
