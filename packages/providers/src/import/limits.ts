export const IMPORT_MAX_ENTRIES = 1000;
export const IMPORT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
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
