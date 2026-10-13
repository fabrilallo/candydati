import { unzipSync } from 'fflate';
import { DEFAULT_IMPORT_LIMITS, IMPORT_RATIO_MIN_BYTES, ImportError, type ImportLimits } from './limits.js';

export interface ImportEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

interface CentralEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly size: number;
  readonly symlink: boolean;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_FIXED = 46;
const EOCD_MIN = 22;
const UNIX_HOST = 3;
const S_IFMT = 0xf000;
const S_IFLNK = 0xa000;
const decoder = new TextDecoder('utf-8');

function findEocd(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - EOCD_MIN - 0xffff);
  for (let index = view.byteLength - EOCD_MIN; index >= lowest; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) return index;
  }
  return -1;
}

/** Reads the central directory without inflating anything. */
function readCentralDirectory(bytes: Uint8Array, limits: ImportLimits): readonly CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.byteLength >= EOCD_MIN ? findEocd(view) : -1;
  if (eocd < 0) throw new ImportError('invalid_archive', 'Not a valid ZIP archive.');
  const total = view.getUint16(eocd + 10, true);
  if (total > limits.maxEntries) throw new ImportError('too_many_entries', `The archive has more than ${limits.maxEntries} entries.`);
  const entries: CentralEntry[] = [];
  let cursor = view.getUint32(eocd + 16, true);
  for (let index = 0; index < total; index += 1) {
    if (cursor + CENTRAL_FIXED > eocd || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new ImportError('invalid_archive', 'Corrupted ZIP central directory.');
    }
    const nameLength = view.getUint16(cursor + 28, true);
    const rest = nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    if (cursor + CENTRAL_FIXED + rest > eocd) throw new ImportError('invalid_archive', 'Corrupted ZIP central directory.');
    const host = view.getUint16(cursor + 4, true) >> 8;
    const mode = view.getUint32(cursor + 38, true) >>> 16;
    entries.push({
      name: decoder.decode(bytes.subarray(cursor + CENTRAL_FIXED, cursor + CENTRAL_FIXED + nameLength)),
      compressedSize: view.getUint32(cursor + 20, true),
      size: view.getUint32(cursor + 24, true),
      symlink: host === UNIX_HOST && (mode & S_IFMT) === S_IFLNK,
    });
    cursor += CENTRAL_FIXED + rest;
  }
  return entries;
}

function normalisePath(name: string): string {
  const unified = name.replaceAll('\\', '/');
  const segments = unified.split('/');
  const unsafe =
    unified.startsWith('/') ||
    /^[A-Za-z]:/.test(unified) ||
    [...unified].some((char) => char.charCodeAt(0) < 0x20) ||
    segments.some((segment, i) => segment === '..' || (segment === '.' && i < segments.length - 1));
  if (unsafe) throw new ImportError('unsafe_path', `Unsafe path in archive: ${JSON.stringify(name)}`);
  return segments.filter((segment) => segment !== '' && segment !== '.').join('/');
}

const isHidden = (path: string): boolean => path.split('/').some((segment) => segment === '__MACOSX' || segment.startsWith('.'));

/** Validates every entry (also the ignored ones) and returns the paths worth inflating. */
function validate(central: readonly CentralEntry[], limits: ImportLimits): ReadonlyMap<string, string> {
  const wanted = new Map<string, string>();
  let total = 0;
  for (const entry of central) {
    const path = normalisePath(entry.name);
    if (entry.symlink) throw new ImportError('symlink', `Symbolic link in archive: ${JSON.stringify(entry.name)}`);
    total += entry.size;
    if (total > limits.maxTotalBytes) throw new ImportError('too_large', 'The archive expands to too much data.');
    const ratioExceeded =
      entry.size > IMPORT_RATIO_MIN_BYTES && (entry.compressedSize === 0 || entry.size / entry.compressedSize > limits.maxRatio);
    if (ratioExceeded) throw new ImportError('ratio_exceeded', `Suspicious compression ratio: ${JSON.stringify(entry.name)}`);
    if (entry.name.endsWith('/') || path === '' || isHidden(path)) continue;
    wanted.set(entry.name, path);
  }
  return wanted;
}

/**
 * Safe unzip in memory. Rejects the whole archive on absolute paths, `..`, symlinks, too many entries, too much
 * expanded data or a suspicious ratio. Nested archives are returned as plain files, never expanded.
 * `__MACOSX` and dotfiles are skipped.
 */
export function readImportArchive(bytes: Uint8Array, limits: ImportLimits = DEFAULT_IMPORT_LIMITS): readonly ImportEntry[] {
  const wanted = validate(readCentralDirectory(bytes, limits), limits);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => wanted.has(file.name) });
  } catch {
    throw new ImportError('invalid_archive', 'The ZIP archive could not be read.');
  }
  const entries: ImportEntry[] = [];
  let total = 0;
  for (const [name, path] of wanted) {
    const content = files[name];
    if (!content) continue;
    total += content.byteLength;
    if (total > limits.maxTotalBytes) throw new ImportError('too_large', 'The archive expands to too much data.');
    entries.push({ path, bytes: content });
  }
  return entries;
}
