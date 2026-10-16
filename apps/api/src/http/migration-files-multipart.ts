import { ValidationError, type FileStorage } from '@candydati/core';
import { MIGRATION_LIMITS, MIGRATION_SHEET_MAX_BYTES, migrationUploadKey, type MigrationUploadName } from '@candydati/domain';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

/** One spreadsheet, and optionally a ZIP of CVs. Nothing else: a third part trips the limit and is refused. */
export const MIGRATION_FILES_MULTIPART_LIMITS = {
  fileSize: MIGRATION_LIMITS.totalBytes,
  fieldSize: 1024,
  files: 2,
  fields: 0,
  parts: 2,
  headerPairs: 20,
} as const;

export interface StoredConnectorFiles {
  readonly sheet: { readonly sizeBytes: number };
  readonly cvs?: { readonly sizeBytes: number };
}

export interface ConnectorFilesTarget {
  readonly organizationId: string;
  readonly batchId: string;
  readonly files: Pick<FileStorage, 'putStream' | 'delete'>;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const looksLikeZip = (chunk: Buffer): boolean => ZIP_MAGIC.every((value, index) => chunk[index] === value);
const refuse = (path: string, message: string): ValidationError => new ValidationError([{ path, message }]);
const tooLarge = (what: string): Error => Object.assign(new Error(`The ${what} is too large.`), { statusCode: 413 });

type Check = (first: Buffer) => void;

/** A spreadsheet is an XLSX (a ZIP) or a text file (CSV): a binary file that is not a ZIP is refused. */
const sheetCheck: Check = (first) => {
  if (!looksLikeZip(first) && first.subarray(0, 4096).includes(0)) throw refuse('sheet', 'not_a_spreadsheet');
};
const cvsCheck: Check = (first) => {
  if (!looksLikeZip(first)) throw refuse('cvs', 'not_a_zip');
};

/** The chunks of one part, refusing it when its start is wrong or it passes `max`. */
async function* capped(part: MultipartFile, max: number, what: string, check: Check): AsyncGenerator<Uint8Array> {
  let size = 0;
  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    if (size === 0) {
      try {
        check(chunk);
      } catch (error) {
        part.file.resume();
        throw error;
      }
    }
    size += chunk.byteLength;
    if (size > max) {
      part.file.resume();
      throw tooLarge(what);
    }
    yield chunk;
  }
  if (part.file.truncated) throw tooLarge(what);
}

const PARTS: Readonly<Record<MigrationUploadName, { readonly max: number; readonly check: Check }>> = {
  sheet: { max: MIGRATION_SHEET_MAX_BYTES, check: sheetCheck },
  cvs: { max: MIGRATION_LIMITS.totalBytes, check: cvsCheck },
};

const isUploadName = (name: string): name is MigrationUploadName => Object.hasOwn(PARTS, name);

/**
 * Reads the `sheet` part (required) and the `cvs` part (optional), in any order, and streams each to storage under the
 * batch prefix as it arrives, so the api holds a few MB, not the files. Anything else in the form is refused, and a
 * refused upload leaves nothing in storage: the files are personal data.
 */
export async function readConnectorFiles(request: FastifyRequest, target: ConnectorFilesTarget): Promise<StoredConnectorFiles> {
  const sizes: Partial<Record<MigrationUploadName, number>> = {};
  const keyOf = (name: MigrationUploadName) => migrationUploadKey(target.organizationId, target.batchId, name);
  try {
    for await (const part of request.parts()) {
      if (part.type !== 'file' || !isUploadName(part.fieldname) || sizes[part.fieldname] !== undefined) throw refuse('file', 'unexpected_part');
      const { max, check } = PARTS[part.fieldname];
      sizes[part.fieldname] = await target.files.putStream(keyOf(part.fieldname), capped(part, max, part.fieldname === 'sheet' ? 'spreadsheet' : 'ZIP', check), 'application/octet-stream');
    }
    if (sizes.sheet === undefined) throw refuse('sheet', 'file_missing');
  } catch (error) {
    await Promise.all((['sheet', 'cvs'] as const).map((name) => target.files.delete(keyOf(name)).catch(() => undefined)));
    throw error;
  }
  return { sheet: { sizeBytes: sizes.sheet }, ...(sizes.cvs === undefined ? {} : { cvs: { sizeBytes: sizes.cvs } }) };
}
