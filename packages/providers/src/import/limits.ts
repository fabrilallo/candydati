/**
 * Limits are per BATCH, shared by every uploaded file of it (an upload is at most `IMPORT_LIMITS.maxBytes`, 200 MB):
 * entries and expanded bytes of all archives together count against `IMPORT_MAX_ENTRIES` and `IMPORT_MAX_TOTAL_BYTES`.
 * Memory does not grow with them: the worker holds one source file, the CSV/XLSX tables (at most
 * `IMPORT_MAX_TABLE_BYTES` each) and the few CVs being read (`DEFAULT_ANALYSIS_CONCURRENCY`); every CV goes to storage
 * and is dropped as soon as it has been read.
 */
export const IMPORT_MAX_ENTRIES = 1000;
export const IMPORT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
/** A sheet is parsed in memory, so it is capped much lower than the batch. */
export const IMPORT_MAX_TABLE_BYTES = 25 * 1024 * 1024;
export const IMPORT_MAX_RATIO = 100;
/** Ratio is checked only above this size: tiny files legitimately compress very well. */
export const IMPORT_RATIO_MIN_BYTES = 64 * 1024;
export const IMPORT_MAX_ROWS = 5000;

export interface ImportLimits {
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxRatio: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxEntries: IMPORT_MAX_ENTRIES,
  maxTotalBytes: IMPORT_MAX_TOTAL_BYTES,
  maxRatio: IMPORT_MAX_RATIO,
};

export type ImportErrorCode =
  | 'invalid_archive'
  | 'unsafe_path'
  | 'symlink'
  | 'too_many_entries'
  | 'too_large'
  | 'ratio_exceeded'
  | 'invalid_table'
  | 'not_notion_export';

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
