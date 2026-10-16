import type { ZipWriter, ZipWriterFactory } from '@candydati/core';
import { zipSync, type Zippable } from 'fflate';

const DEFLATE_LEVEL = 6;
/** Fixed timestamp: the same entries always produce the same archive. */
const ENTRY_MTIME = new Date(Date.UTC(2000, 0, 1));

const hasForbiddenChar = (path: string): boolean => path.includes('\\') || [...path].some((char) => char.charCodeAt(0) < 0x20);

/** `a/b.json`: relative, `/` separated, no empty, `.` or `..` segment, no control characters or backslashes. */
export function assertZipPath(path: string): void {
  const valid =
    path.length > 0 &&
    !path.startsWith('/') &&
    !hasForbiddenChar(path) &&
    !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  if (!valid) throw new Error(`Invalid ZIP entry path: ${JSON.stringify(path)}`);
}

/**
 * ZIP archive in memory (fflate, deflate). Entries are written sorted by path, so the order never depends on the
 * order they were added in. A path that is absolute, contains `..` or is added twice is rejected.
 */
export function createZipWriter(): ZipWriter {
  const entries = new Map<string, Uint8Array>();
  let finished = false;
  return {
    add(path, bytes) {
      if (finished) return Promise.reject(new Error('The ZIP writer is already finished.'));
      try {
        assertZipPath(path);
        if (entries.has(path)) throw new Error(`Duplicate ZIP entry: ${path}`);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      entries.set(path, bytes);
      return Promise.resolve();
    },
    finish() {
      if (finished) return Promise.reject(new Error('The ZIP writer is already finished.'));
      finished = true;
      const sorted: Zippable = {};
      for (const path of [...entries.keys()].sort()) sorted[path] = [entries.get(path)!, { level: DEFLATE_LEVEL, mtime: ENTRY_MTIME }];
      entries.clear();
      return Promise.resolve(zipSync(sorted));
    },
  };
}

export const zipWriterFactory: ZipWriterFactory = createZipWriter;
