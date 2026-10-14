import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

/**
 * Inflating a ZIP entry trusts nothing the archive says about itself: the sizes in the headers are written by whoever
 * made the file. Here the bytes that actually come out of the decompressor are counted, and the work stops as soon as
 * a cap is crossed, before the data is ever held in memory (a 300 KB file can inflate to gigabytes).
 */
export interface InflateBudget {
  /** Most bytes one entry may inflate to. */
  readonly maxEntryBytes: number;
  /** Most bytes all entries together may inflate to. */
  readonly maxTotalBytes: number;
  readonly maxEntries: number;
}

export type ZipBoundsReason = 'invalid_archive' | 'too_many_entries' | 'entry_too_large' | 'total_too_large';

export class ZipBoundsError extends Error {
  constructor(
    readonly reason: ZipBoundsReason,
    message: string,
  ) {
    super(message);
    this.name = 'ZipBoundsError';
  }
}

export interface InflateOptions {
  /** Only these entries are read at all (the others are skipped, not inflated). Default: every entry is read and counted. */
  readonly only?: (name: string) => boolean;
  /** Entries to keep in memory (`name` as in the archive). Others are counted and dropped. Default: none are kept. */
  readonly keep?: (name: string) => boolean;
  /** Largest size an entry may reach, by name (its declared size): more is a lie about the size, not just a big file. */
  readonly declaredSize?: (name: string) => number | undefined;
}

/** Compressed bytes handed to the decompressor at a time: at most ~8 MB of output between two checks. */
const PUSH_SLICE_BYTES = 8 * 1024;

const concat = (chunks: readonly Uint8Array[], length: number): Uint8Array => {
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
};

/**
 * Streams every entry through the decompressor, counting what comes out. Throws `ZipBoundsError` the moment an entry,
 * the total or the entry count goes over the budget, or an entry produces more than its declared size. Returns the
 * entries `options.keep` asked for.
 */
export function inflateBounded(bytes: Uint8Array, budget: InflateBudget, options: InflateOptions = {}): ReadonlyMap<string, Uint8Array> {
  const kept = new Map<string, Uint8Array>();
  let entries = 0;
  let total = 0;
  // The decompressor catches what its callbacks throw and reports it as a stream error: keep the first real cause.
  let abort: ZipBoundsError | null = null;
  const stop = (reason: ZipBoundsReason, message: string): never => {
    abort ??= new ZipBoundsError(reason, message);
    throw abort;
  };
  const unzip = new Unzip((file) => {
    entries += 1;
    if (entries > budget.maxEntries) stop('too_many_entries', 'The archive has too many entries.');
    if (file.name.endsWith('/') || (options.only && !options.only(file.name))) return;
    const declared = options.declaredSize?.(file.name);
    const keep = options.keep?.(file.name) ?? false;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (abort) throw abort;
      if (error) return stop('invalid_archive', 'The ZIP archive could not be read.');
      size += chunk.byteLength;
      total += chunk.byteLength;
      if (size > budget.maxEntryBytes || (declared !== undefined && size > declared)) {
        stop('entry_too_large', 'An archive entry inflates to more than allowed.');
      }
      if (total > budget.maxTotalBytes) stop('total_too_large', 'The archive inflates to too much data.');
      if (keep) chunks.push(chunk.slice());
      if (final && keep) kept.set(file.name, concat(chunks, size));
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  try {
    // The decompressor inflates a whole pushed chunk before it hands anything back: feeding it the file in small slices
    // is what bounds memory (a slice of compressed bytes expands to at most ~1000 times its size).
    for (let at = 0; at < bytes.byteLength; at += PUSH_SLICE_BYTES) {
      unzip.push(bytes.subarray(at, at + PUSH_SLICE_BYTES), at + PUSH_SLICE_BYTES >= bytes.byteLength);
    }
  } catch (error) {
    throw abort ?? (error instanceof ZipBoundsError ? error : new ZipBoundsError('invalid_archive', 'The ZIP archive could not be read.'));
  }
  if (abort) throw abort;
  return kept;
}

/** Limits for an Office document (DOCX, XLSX): far above any real CV or sheet, far below what takes a worker down. */
export const OOXML_BUDGET: InflateBudget = { maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024, maxEntries: 2000 };

/** True when the document inflates within `OOXML_BUDGET`. Nothing is kept: it only counts. */
export function isWithinOoxmlBudget(bytes: Uint8Array, budget: InflateBudget = OOXML_BUDGET): boolean {
  try {
    inflateBounded(bytes, budget);
    return true;
  } catch (error) {
    if (error instanceof ZipBoundsError) return false;
    throw error;
  }
}
