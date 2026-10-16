import { ValidationError, type FileStorage } from '@candydati/core';
import { MIGRATION_LIMITS, migrationPackageKey } from '@candydati/domain';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

/** Framing and slack: the package itself is bounded by `MIGRATION_LIMITS.totalBytes`. */
export const MIGRATION_BODY_LIMIT = MIGRATION_LIMITS.totalBytes + 4 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Exactly one part, the package. A second file would be dropped silently by the parser: the limit event refuses it instead. */
export const MIGRATION_MULTIPART_LIMITS = {
  fileSize: MIGRATION_LIMITS.totalBytes,
  fieldSize: 1024,
  files: 1,
  fields: 0,
  parts: 1,
  headerPairs: 20,
} as const;

export interface StoredMigrationPackage {
  /** The id the storage key was made with; `createMigrationFromPackage` registers the batch under it. */
  readonly batchId: string;
  readonly key: string;
  readonly sizeBytes: number;
}

export interface MigrationUploadTarget {
  readonly organizationId: string;
  readonly newId: () => string;
  readonly files: Pick<FileStorage, 'putStream' | 'delete'>;
}

const tooLarge = (): Error => Object.assign(new Error('The package is too large.'), { statusCode: 413 });
const refuse = (message: string): ValidationError => new ValidationError([{ path: 'file', message }]);
const looksLikeZip = (chunk: Buffer): boolean => ZIP_MAGIC.every((value, index) => chunk[index] === value);

/** The chunks of the file, refusing it once it passes the package limit or when it does not start like a ZIP. */
async function* cappedZip(part: MultipartFile): AsyncGenerator<Uint8Array> {
  let size = 0;
  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    if (size === 0 && !looksLikeZip(chunk)) {
      part.file.resume();
      throw refuse('not_a_zip');
    }
    size += chunk.byteLength;
    if (size > MIGRATION_LIMITS.totalBytes) {
      part.file.resume();
      throw tooLarge();
    }
    yield chunk;
  }
  if (part.file.truncated) throw tooLarge();
}

/**
 * Reads the single `file` part and streams it to storage as it arrives (multipart upload on S3), so the api holds a few
 * MB, not the package. The name is only a label; the analysis opens and checks the archive. Anything else in the form is
 * refused, and a refused upload leaves nothing in storage.
 */
export async function readMigrationPackage(request: FastifyRequest, target: MigrationUploadTarget): Promise<StoredMigrationPackage> {
  const batchId = target.newId();
  const key = migrationPackageKey(target.organizationId, batchId);
  let sizeBytes: number | null = null;
  try {
    for await (const part of request.parts()) {
      if (part.type !== 'file' || part.fieldname !== 'file' || sizeBytes !== null) throw refuse('unexpected_part');
      sizeBytes = await target.files.putStream(key, cappedZip(part), 'application/zip');
    }
  } catch (error) {
    await target.files.delete(key).catch(() => undefined);
    throw error;
  }
  if (sizeBytes === null) throw refuse('file_missing');
  return { batchId, key, sizeBytes };
}
