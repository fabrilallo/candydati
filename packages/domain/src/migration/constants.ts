/** Constants of the migration package (ADR 0009), shared by the schema and the archive reader. */
export const MIGRATION_PACKAGE_SCHEMA_ID = 'migration-package.v1';
export const MIGRATION_PACKAGE_FORMAT = 'candydati-migration';
/** Name of the manifest at the root of the ZIP. */
export const MIGRATION_MANIFEST_NAME = 'migration.json';
/** Every referenced file lives under this folder of the ZIP. */
export const MIGRATION_FILES_DIR = 'files/';

export const MIGRATION_LIMITS = {
  users: 5_000,
  jobs: 10_000,
  stagesPerJob: 50,
  candidates: 50_000,
  applications: 100_000,
  notes: 200_000,
  messages: 200_000,
  /** Files referenced across the whole package. */
  files: 120_000,
  filesPerApplication: 50,
  answersPerApplication: 100,
  stageHistoryPerApplication: 200,
  /** Uncompressed size of everything in the ZIP; checked by the archive reader. */
  totalBytes: 20 * 1024 ** 3,
  /** Uncompressed size of `migration.json`. */
  manifestBytes: 256 * 1024 ** 2,
} as const;

export const MIGRATION_JOB_STATUSES = ['draft', 'open', 'closed'] as const;
export const MIGRATION_FILE_KINDS = ['cv', 'cover_letter', 'other'] as const;

/**
 * A relative path under `files/`: no absolute path, no `..` or `.` segment, no empty segment, no backslash, no
 * control character. The archive reader applies the same rule to the ZIP entries.
 */
export function isMigrationFilePath(path: string): boolean {
  if (!path.startsWith(MIGRATION_FILES_DIR) || path.length > 500) return false;
  if (path.includes('\\') || /\p{Cc}/u.test(path)) return false;
  const segments = path.slice(MIGRATION_FILES_DIR.length).split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

