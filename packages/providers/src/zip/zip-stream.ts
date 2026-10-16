import type { ZipStream, ZipStreamFactory } from '@candydati/core';
import { AsyncZipDeflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { BoundedChunkQueue, HIGH_WATER_BYTES } from './bounded-queue.js';
import { assertZipPath } from './zip-writer.js';

const DEFLATE_LEVEL = 6;
/** Fixed timestamp: the same entries always produce the same bytes. */
const ENTRY_MTIME = new Date(Date.UTC(2000, 0, 1));
/**
 * Entries above this size are deflated on a worker thread (a thread costs tens of milliseconds to start, so small ones
 * run inline and do not block the event loop for long).
 */
export const ASYNC_DEFLATE_MIN_BYTES = 512 * 1024;
/** Original CVs (PDF, DOCX) are already compressed: storing them costs no CPU and loses almost nothing. */
const STORED_PREFIX = 'files/';
export { HIGH_WATER_BYTES };

const entryFor = (path: string, size: number): ZipPassThrough | ZipDeflate | AsyncZipDeflate => {
  if (path.startsWith(STORED_PREFIX)) return new ZipPassThrough(path);
  return size >= ASYNC_DEFLATE_MIN_BYTES ? new AsyncZipDeflate(path, { level: DEFLATE_LEVEL }) : new ZipDeflate(path, { level: DEFLATE_LEVEL });
};

/**
 * Streaming ZIP (fflate `Zip`; large entries are deflated on worker threads, `files/` entries are stored): entries are handled one at a time and
 * the archive is handed out in chunks through `output`, so memory stays at about one entry plus `HIGH_WATER_BYTES`.
 * Entries appear in the order they are added. A path that is absolute, contains `..` or is added twice is rejected.
 */
export function createZipStream(): ZipStream {
  const queue = new BoundedChunkQueue();
  const seen = new Set<string>();
  let closed = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) return queue.fail(error);
    queue.push(chunk);
    if (final) queue.end();
  });

  const stop = (error: Error): void => {
    closed = true;
    zip.terminate();
    queue.fail(error);
  };

  return {
    output: queue.iterable,
    async add(path, bytes) {
      if (closed) throw new Error('The ZIP stream is already finished.');
      assertZipPath(path);
      if (seen.has(path)) throw new Error(`Duplicate ZIP entry: ${path}`);
      seen.add(path);
      await queue.room();
      const file = entryFor(path, bytes.byteLength);
      file.mtime = ENTRY_MTIME;
      const compressed = new Promise<void>((resolve, reject) => {
        zip.add(file);
        const forward = file.ondata;
        file.ondata = (error, chunk, final) => {
          forward(error, chunk, final);
          if (error) reject(error);
          else if (final) resolve();
        };
      });
      // fflate hands the buffer to a worker thread (it is detached afterwards): give it its own copy.
      file.push(new Uint8Array(bytes), true);
      await compressed;
      await queue.room();
    },
    async finish() {
      if (closed) throw new Error('The ZIP stream is already finished.');
      closed = true;
      zip.end();
    },
    abort(error) {
      if (!closed) stop(error);
      else queue.fail(error);
    },
  };
}

export const zipStreamFactory: ZipStreamFactory = createZipStream;
