import {
  MIGRATION_FILES_DIR,
  MIGRATION_LIMITS,
  MIGRATION_MANIFEST_NAME,
  isMigrationFilePath,
  parseMigrationPackage,
  type MigrationPackage,
} from '@candydati/domain';
import { openImportArchive, readCentralDirectory, type ImportArchive } from '../import/archive.js';
import { IMPORT_MAX_RATIO, ImportError, type ImportLimits } from '../import/limits.js';

export type MigrationPackageErrorCode =
  | 'invalid_archive'
  | 'unsafe_path'
  | 'symlink'
  | 'too_many_entries'
  | 'too_large'
  | 'ratio_exceeded'
  | 'missing_manifest'
  | 'invalid_manifest'
  | 'unexpected_entry'
  | 'duplicate_entry'
  | 'missing_files';

/** Why a package was refused. `details` lists the offending paths or schema issues (capped), never file contents. */
export class MigrationPackageError extends Error {
  constructor(
    readonly code: MigrationPackageErrorCode,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'MigrationPackageError';
  }
}

export interface MigrationArchiveLimits extends ImportLimits {
  /** Uncompressed size of `migration.json`. */
  readonly manifestBytes: number;
}

/** Room for the manifest and the directory entries a ZIP tool adds next to the files. */
const DIRECTORY_ENTRIES_ALLOWANCE = 10_000;
/** Most compressed bytes read from a stream into memory: a package never inflates past MIGRATION_LIMITS.totalBytes. */
export const MIGRATION_ARCHIVE_MAX_BYTES = MIGRATION_LIMITS.totalBytes;
const DETAILS_MAX = 100;

export const DEFAULT_MIGRATION_ARCHIVE_LIMITS: MigrationArchiveLimits = {
  maxEntries: MIGRATION_LIMITS.files + DIRECTORY_ENTRIES_ALLOWANCE,
  maxTotalBytes: MIGRATION_LIMITS.totalBytes,
  maxRatio: IMPORT_MAX_RATIO,
  manifestBytes: MIGRATION_LIMITS.manifestBytes,
};

export interface OpenMigrationPackageOptions {
  readonly limits?: Partial<MigrationArchiveLimits>;
  /** Cap on the compressed bytes collected from a stream. */
  readonly maxArchiveBytes?: number;
}

export interface MigrationPackageFile {
  /** Declared size once inflated; reading never returns more. */
  readonly size: number;
  /** Inflates the file; only this file is held in memory. */
  read(): Promise<Uint8Array>;
}

export interface OpenedMigrationPackage {
  readonly manifest: MigrationPackage;
  /** Every file the manifest references, by its path in the package. */
  readonly files: ReadonlyMap<string, MigrationPackageFile>;
  /** Files under `files/` that nothing references: reported, not imported. */
  readonly unreferenced: readonly string[];
}

const IMPORT_CODES = new Set<string>(['invalid_archive', 'unsafe_path', 'symlink', 'too_many_entries', 'too_large', 'ratio_exceeded']);

function translate(error: unknown): never {
  if (error instanceof ImportError) {
    const code = IMPORT_CODES.has(error.code) ? (error.code as MigrationPackageErrorCode) : 'invalid_archive';
    throw new MigrationPackageError(code, error.message);
  }
  throw error;
}

async function collect(input: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of input) {
    length += chunk.byteLength;
    if (length > maxBytes) throw new MigrationPackageError('too_large', 'The package is larger than allowed.');
    parts.push(chunk);
  }
  const bytes = new Uint8Array(length);
  parts.reduce((at, part) => {
    bytes.set(part, at);
    return at + part.byteLength;
  }, 0);
  return bytes;
}

const isHiddenSegment = (segment: string): boolean => segment === '__MACOSX' || segment.startsWith('.');
const looksUnsafe = (name: string): boolean =>
  name.startsWith('/') || name.includes('\\') || name.split('/').some((segment, index, all) => segment === '..' || segment === '.' || (segment === '' && index < all.length - 1));

/**
 * Checks every raw entry name: only `migration.json` and files under `files/` (directories are allowed and ignored),
 * canonical paths only (the name must be exactly what the manifest would reference), no hidden entries, no duplicates.
 * Returns the paths of the files under `files/`.
 */
function checkEntries(bytes: Uint8Array, limits: ImportLimits): readonly string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const { name } of readCentralDirectory(bytes, limits)) {
    if (seen.has(name)) throw new MigrationPackageError('duplicate_entry', 'The package has the same entry twice.', [name]);
    seen.add(name);
    if (looksUnsafe(name)) throw new MigrationPackageError('unsafe_path', 'Unsafe path in the package.', [name]);
    if (name === MIGRATION_MANIFEST_NAME || (name.endsWith('/') && (name === MIGRATION_FILES_DIR || name.startsWith(MIGRATION_FILES_DIR)))) continue;
    if (name.endsWith('/') || !isMigrationFilePath(name) || name.split('/').some(isHiddenSegment)) {
      throw new MigrationPackageError('unexpected_entry', 'Only migration.json and files under files/ may be in the package.', [name]);
    }
    files.push(name);
  }
  return files;
}

function readManifest(archive: ImportArchive, manifestBytes: number): MigrationPackage {
  const entry = archive.entries.find((candidate) => candidate.name === MIGRATION_MANIFEST_NAME);
  if (!entry) throw new MigrationPackageError('missing_manifest', 'The package has no migration.json.');
  if (entry.size > manifestBytes) throw new MigrationPackageError('too_large', 'migration.json is larger than allowed.');
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(archive.inflate(entry.name)));
  } catch (error) {
    if (error instanceof ImportError) translate(error);
    throw new MigrationPackageError('invalid_manifest', 'migration.json is not valid JSON.');
  }
  const parsed = parseMigrationPackage(json);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, DETAILS_MAX).map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new MigrationPackageError('invalid_manifest', 'migration.json does not match the migration package schema.', details);
  }
  return parsed.data;
}

function fileReader(archive: ImportArchive, path: string, size: number): MigrationPackageFile {
  return {
    size,
    read: async () => {
      try {
        return archive.inflate(path);
      } catch (error) {
        return translate(error);
      }
    },
  };
}

/**
 * Opens a migration package (ADR 0009) and checks it before anything is written: a safe ZIP (no traversal, no symlinks,
 * no zip bombs, within the size and entry limits), only `migration.json` and `files/`, a manifest that matches the
 * schema, and every referenced file present. Files are inflated one at a time, on `read()`.
 */
export async function openMigrationPackage(
  input: Uint8Array | AsyncIterable<Uint8Array>,
  options: OpenMigrationPackageOptions = {},
): Promise<OpenedMigrationPackage> {
  const limits = { ...DEFAULT_MIGRATION_ARCHIVE_LIMITS, ...options.limits };
  const bytes = input instanceof Uint8Array ? input : await collect(input, options.maxArchiveBytes ?? MIGRATION_ARCHIVE_MAX_BYTES);
  let archive: ImportArchive;
  let present: readonly string[];
  try {
    archive = openImportArchive(bytes, limits);
    present = checkEntries(bytes, limits);
  } catch (error) {
    return translate(error);
  }
  const manifest = readManifest(archive, limits.manifestBytes);
  const sizes = new Map(archive.entries.map((entry) => [entry.name, entry.size]));
  const referenced = new Set(manifest.applications.flatMap((application) => application.files.map((file) => file.path)));
  const missing = [...referenced].filter((path) => !sizes.has(path));
  if (missing.length > 0) {
    throw new MigrationPackageError('missing_files', 'Files referenced by migration.json are missing.', missing.slice(0, DETAILS_MAX));
  }
  const files = new Map([...referenced].map((path) => [path, fileReader(archive, path, sizes.get(path) ?? 0)] as const));
  return { manifest, files, unreferenced: present.filter((path) => !referenced.has(path)) };
}
